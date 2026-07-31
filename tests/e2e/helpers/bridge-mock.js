/**
 * Shared Playwright helpers for NoteHub e2e tests.
 *
 * Centralises the Drive-bridge mock, email capture, and a clean
 * register/login flow. New specs should import from here rather than
 * re-rolling the same fixtures.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const fixtureDir = path.join(__dirname, '..', 'fixtures');

export const TEST_PASSWORD = 'TestPass123!';
export const uniqueEmail = (prefix = 'notehub') =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`;

/**
 * Injects a fake Drive-bridge URL into the page *before* the app boots
 * (so NOTEHUB_CONFIG is populated) and intercepts POSTs to script.google.com
 * so the upload flow completes without a real Web App.
 *
 * Captures the email payload in `window.__NOTEHUB_TEST_INBOX__` (an array
 * of decoded JSON bodies) so specs can assert on sent emails.
 */
export async function mockDriveBridge(page) {
  await page.addInitScript(() => {
    window.__NOTEHUB_TEST_INBOX__ = [];
  });
  // We can't override window.NOTEHUB_CONFIG.driveUploadUrl via addInitScript
  // because firebase-config.js runs as a classic <script> after and re-sets
  // the whole object. So we route the firebase-config.js request and inject
  // a config that includes a working driveUploadUrl while preserving the
  // real firebase block (so registration still hits the real project).
  await page.route('**/firebase-config.js', async (route) => {
    const realConfig = await route.fetch().then((r) => r.text()).catch(() => '');
    const firebaseMatch = realConfig.match(/firebase:\s*\{[\s\S]*?\n\s*\}/);
    const firebaseBlock = firebaseMatch ? firebaseMatch[0] : `firebase: { apiKey: 'placeholder' }`;
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.NOTEHUB_CONFIG = {
  ${firebaseBlock},
  driveUploadUrl: 'https://script.google.com/macros/s/TEST_BRIDGE/exec',
  bridgeToken: 'test_bridge_token',
};`,
    });
  });
  await page.route('**/script.google.com/**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      let body = {};
      try {
        body = JSON.parse(req.postData() || '{}');
      } catch {}
      // Capture sendEmail payloads
      if (body.action === 'sendEmail') {
        await page.evaluate((payload) => {
          window.__NOTEHUB_TEST_INBOX__ = window.__NOTEHUB_TEST_INBOX__ || [];
          window.__NOTEHUB_TEST_INBOX__.push(payload);
        }, body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      if (body.action === 'verifyConfig') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, version: '2' }),
        });
        return;
      }
      // Default: upload — return a fake Drive file
      const fakeId = `drive_fake_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: fakeId,
          name: 'mocked-file.txt',
          mimeType: 'text/plain',
          size: 1024,
          webViewLink: `https://drive.google.com/file/d/${fakeId}/view`,
        }),
      });
      return;
    }
    // GET (ping / healthcheck)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, service: 'NoteHub Drive bridge', version: '2' }),
    });
  });
}

/**
 * Returns the captured email payloads (cleared by the test if it calls reset).
 */
export async function getInbox(page) {
  return await page.evaluate(() => window.__NOTEHUB_TEST_INBOX__ || []);
}

export async function resetInbox(page) {
  await page.evaluate(() => {
    window.__NOTEHUB_TEST_INBOX__ = [];
  });
}

/**
 * Standard teardown between tests — wipe IndexedDB / cookies / storage
 * so test users don't bleed into each other.
 */
export async function resetClient(page, context) {
  await page.evaluate(async () => {
    try {
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        await Promise.all(
          dbs.map(
            (d) =>
              new Promise((r) => {
                const req = indexedDB.deleteDatabase(d.name);
                req.onsuccess = req.onerror = req.onblocked = () => r();
              })
          )
        );
      }
    } catch {}
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
  await context.clearCookies();
}

/**
 * Registers a new user via the in-app Register modal and waits for the
 * authenticated state to settle. Returns the email used.
 *
 * If Email/Password isn't enabled on the target Firebase project the test
 * is skipped with `test.skip(true, reason)`.
 */
export async function registerUser(page, providerStatus, email) {
  if (!providerStatus?.ok) {
    return { skipped: true, reason: providerStatus?.reason || 'auth provider not available' };
  }
  await page.goto('/');
  await page.locator('#register-btn').click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(TEST_PASSWORD);
  await page.locator('#auth-submit').click();

  try {
    await page.waitForFunction(
      () => {
        const fab = document.getElementById('share-fab');
        const err = document.getElementById('auth-error');
        return (fab && !fab.hidden) || (err && !err.hidden);
      },
      { timeout: 15_000 }
    );
  } catch {
    // Slow signup; fall through to the assert below.
  }

  const errVisible = await page.locator('#auth-error').isVisible().catch(() => false);
  if (errVisible) {
    const text = (await page.locator('#auth-error').textContent()) || '';
    if (/CONFIGURATION_NOT_FOUND|configuration-not-found/i.test(text)) {
      return { skipped: true, reason: 'Email/Password provider not enabled' };
    }
  }
  await page.locator('#share-fab').waitFor({ state: 'visible', timeout: 10_000 });
  return { skipped: false, email };
}

/**
 * Uploads a note via the in-app flow. Caller supplies overrides; defaults
 * match the smoke-test upload.
 */
export async function uploadNoteViaUI(page, { title, creator, course } = {}) {
  const finalTitle   = title   || `Note ${Date.now()}`;
  const finalCreator = creator || 'Test Student';
  const finalCourse  = course  || 'CS 101';
  await page.locator('#share-fab').click();
  await page.locator('#upload-modal').waitFor({ state: 'visible' });
  await page.locator('#upload-form input[name="title"]').fill(finalTitle);
  await page.locator('#upload-form input[name="creator"]').fill(finalCreator);
  await page.locator('#upload-form input[name="course"]').fill(finalCourse);
  await page.locator('#upload-form input[type="file"]').setInputFiles(
    path.join(fixtureDir, 'sample.txt')
  );
  await page.locator('#upload-submit').click();
  await page.locator('#upload-modal').waitFor({ state: 'hidden', timeout: 30_000 });
  return { title: finalTitle, creator: finalCreator, course: finalCourse };
}
