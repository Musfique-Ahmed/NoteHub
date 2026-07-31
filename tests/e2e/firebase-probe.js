import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Pulls the Firebase apiKey out of the gitignored firebase-config.js by
 * simple regex — good enough for a test precheck (no need to eval the file).
 * firebase-config.js assigns window.NOTEHUB_CONFIG = { firebase: { apiKey: "..." } }
 * but since it's a classic <script> (not a module), we just regex the source.
 */
export function readFirebaseConfig() {
  const configPath = path.join(__dirname, '..', '..', 'firebase-config.js');
  if (!fs.existsSync(configPath)) {
    return { apiKey: null, html: null };
  }
  const src = fs.readFileSync(configPath, 'utf8');
  const apiKeyMatch = src.match(/apiKey:\s*"([^"]+)"/);
  return { apiKey: apiKeyMatch?.[1] || null, html: src };
}

/**
 * Probes the deployed Firestore rules by signing in as a temporary user
 * and attempting to read the top-level groups collection. Returns:
 *   { ok: true }                   — rules allow authenticated reads on /groups
 *   { ok: false, reason }          — permission denied (rules not deployed,
 *                                     or only the legacy default rules)
 *
 * Specs that create or query groups/sessions/notifs should call this and
 * `test.skip()` when ok=false. Without deployed rules, those specs will
 * fail with "Missing or insufficient permissions" on every Firestore call.
 */
export async function probeFirestoreRules() {
  const { apiKey } = readFirebaseConfig();
  if (!apiKey || apiKey.startsWith('YOUR_')) {
    return { ok: false, reason: 'Firebase apiKey missing' };
  }
  // Register a throwaway probe user (it'll linger but can't be logged into).
  const probeEmail = `firestore_probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;
  let idToken = null;
  try {
    const signup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: probeEmail, password: 'ProbePass123!', returnSecureToken: true }),
    });
    const signupBody = await signup.json().catch(() => ({}));
    if (!signup.ok || !signupBody.idToken) {
      return { ok: false, reason: `signup failed: ${signupBody?.error?.message || 'unknown'}` };
    }
    idToken = signupBody.idToken;
  } catch (err) {
    return { ok: false, reason: `signup network error: ${err.message}` };
  }
  // Attempt a list of /groups (limit 1). If this returns 200 OR 404 with
  // an empty body, rules allow read; if it's 403, rules don't.
  const projectId = (readFirebaseConfig().html || '').match(/projectId:\s*"([^"]+)"/)?.[1];
  if (!projectId) return { ok: false, reason: 'projectId missing in firebase-config.js' };
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups?pageSize=1`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (res.status === 200) return { ok: true };
    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, reason: `Firestore denied: ${body?.error?.message || 'rules not deployed'}` };
    }
    return { ok: false, reason: `Firestore rules probe HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, reason: `Firestore rules probe network error: ${err.message}` };
  }
}

/**
 * Probes the deployed Apps Script Web App (Drive bridge) to verify it
 * responds to a GET ping. Returns:
 *   { ok: true, version }        — bridge reachable, returns version
 *   { ok: false, reason }        — bridge unreachable, missing config, etc.
 *
 * Specs that depend on a live bridge (e.g. sendEmail assertions in
 * sessions.spec.js) should `test.skip()` when this returns ok=false.
 */
export async function probeBridge() {
  const cfg = readFirebaseConfig();
  // We can't read driveUploadUrl from the regex above; fall back to the
  // NOTEHUB_CONFIG global injected via addInitScript in mockDriveBridge.
  // Since this runs in the Node process, the only safe option is to read
  // firebase-config.js source for a non-placeholder driveUploadUrl.
  const src = cfg.html || '';
  const m = src.match(/driveUploadUrl:\s*"([^"]+)"/);
  const url = m?.[1];
  if (!url || url.startsWith('PASTE_')) {
    return { ok: false, reason: 'driveUploadUrl is a placeholder in firebase-config.js' };
  }
  try {
    const res = await fetch(`${url}?action=ping`);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status} from bridge` };
    const body = await res.json().catch(() => ({}));
    if (!body || body.ok !== true) {
      return { ok: false, reason: 'bridge did not respond with ok:true' };
    }
    return { ok: true, version: body.version || null };
  } catch (err) {
    return { ok: false, reason: `bridge probe failed: ${err.message}` };
  }
}

/**
 * Probes the Firebase Identity Toolkit signUp endpoint to detect whether
 * Email/Password is enabled for the configured project. Returns one of:
 *   { ok: true }                       — provider enabled
 *   { ok: false, reason: '...' }       — provider not enabled (or other config error)
 */
export async function probeEmailPasswordProvider() {
  const { apiKey } = readFirebaseConfig();
  if (!apiKey || apiKey.startsWith('YOUR_')) {
    return { ok: false, reason: 'Firebase apiKey missing in firebase-config.js (copy firebase-config.example.js to firebase-config.js and fill in your values)' };
  }
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `probe_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
        password: 'ProbePass123!',
        returnSecureToken: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || '';
    // Specifically CONFIGURATION_NOT_FOUND means Email/Password provider not enabled.
    if (/CONFIGURATION_NOT_FOUND/i.test(msg)) {
      return { ok: false, reason: 'Email/Password provider not enabled for this Firebase project' };
    }
    if (/INVALID_API_KEY|API_KEY_INVALID|invalid api key/i.test(msg)) {
      return { ok: false, reason: 'Firebase apiKey is invalid' };
    }
    // Successful signUp (status 200) OR other errors (email-in-use, weak-password, etc.)
    // all imply the provider is enabled. The probe account will linger in Firebase but
    // that's harmless — it's a fake email that can't be logged into.
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `Probe network error: ${err.message}` };
  }
}