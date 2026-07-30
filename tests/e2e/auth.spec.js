import { test, expect } from '@playwright/test';
import { probeEmailPasswordProvider } from './firebase-probe.js';

const PASSWORD = 'TestPass123!';
const uniqueEmail = () => `notehub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`;

// One probe per file run — cached so we don't hit Firebase on every test.
let providerStatus = null;
test.beforeAll(async () => {
  providerStatus = await probeEmailPasswordProvider();
});

test.afterEach(async ({ page, context }) => {
  // Clear IndexedDB / cookies to keep tests independent and avoid worker crashes.
  await page.evaluate(async () => {
    try {
      const dbs = await indexedDB.databases?.();
      if (dbs) await Promise.all(dbs.map((d) => new Promise((r) => {
        const req = indexedDB.deleteDatabase(d.name);
        req.onsuccess = req.onerror = req.onblocked = () => r();
      })));
    } catch {}
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
  });
  await context.clearCookies();
});

async function registerOrSkip(page, email) {
  if (!providerStatus?.ok) test.skip(true, `Skipping: ${providerStatus?.reason}`);
  await page.goto('/');
  await page.locator('#register-btn').click();
  await expect(page.locator('#auth-modal')).toBeVisible();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(PASSWORD);
  await page.locator('#auth-submit').click();

  // Wait for the form to settle: either share FAB appears or auth-error becomes visible.
  try {
    await page.waitForFunction(
      () => {
        const fab = document.getElementById('share-fab');
        const err = document.getElementById('auth-error');
        const fabVisible = fab && !fab.hidden;
        const errVisible = err && !err.hidden;
        return fabVisible || errVisible;
      },
      { timeout: 15_000 }
    );
  } catch {
    // Allow a slow auth
  }

  const errVisible = await page.locator('#auth-error').isVisible();
  if (errVisible) {
    const text = (await page.locator('#auth-error').textContent()) || '';
    if (/CONFIGURATION_NOT_FOUND|configuration-not-found/i.test(text)) {
      test.skip(true, 'Firebase Email/Password provider not enabled');
    }
  }
  await expect(page.locator('#share-fab')).toBeVisible();
}

test.describe('NoteHub — auth', () => {
  test('register a new user and reach the logged-in state', async ({ page }) => {
    await registerOrSkip(page, uniqueEmail());
    await expect(page.locator('#auth-modal')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#share-fab')).toBeVisible();
    await expect(page.locator('#logout-btn')).toBeVisible();
  });

  test('logout returns UI to logged-out state', async ({ page }) => {
    await registerOrSkip(page, uniqueEmail());
    await page.locator('#logout-btn').click();
    await expect(page.locator('#share-fab')).toBeHidden();
    await expect(page.locator('#login-btn')).toBeVisible();
    await expect(page.locator('#register-btn')).toBeVisible();
  });

  test('auth modal toggles between Sign in and Register', async ({ page }) => {
    test.skip(!providerStatus?.ok, `Skipping: ${providerStatus?.reason}`);
    await page.goto('/');
    await page.locator('#login-btn').click();
    await expect(page.locator('#auth-title')).toHaveText(/sign in/i);
    await page.locator('#auth-toggle').click();
    await expect(page.locator('#auth-title')).toHaveText(/create an account|register/i);
    await page.locator('#auth-toggle').click();
    await expect(page.locator('#auth-title')).toHaveText(/sign in/i);
  });

  test('Escape closes any open modal', async ({ page }) => {
    test.skip(!providerStatus?.ok, `Skipping: ${providerStatus?.reason}`);
    await page.goto('/');
    await page.locator('#login-btn').click();
    await expect(page.locator('#auth-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#auth-modal')).toBeHidden();
  });
});