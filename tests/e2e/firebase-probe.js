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