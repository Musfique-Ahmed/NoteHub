import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Pulls the firebaseConfig out of index.html by simple replacement — good enough
 * for a test precheck (no need for a full HTML parser).
 */
export function readFirebaseConfig() {
  const indexPath = path.join(__dirname, '..', '..', 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const apiKeyMatch = html.match(/apiKey:\s*"([^"]+)"/);
  return { apiKey: apiKeyMatch?.[1] || null, html };
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
    return { ok: false, reason: 'Firebase apiKey missing in index.html' };
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