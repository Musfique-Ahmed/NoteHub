import { test, expect } from '@playwright/test';
import { probeEmailPasswordProvider, probeFirestoreRules } from './firebase-probe.js';
import {
  mockDriveBridge,
  resetClient,
  uniqueEmail,
  registerUser,
} from './helpers/bridge-mock.js';

let providerStatus = null;
test.beforeAll(async () => {
  providerStatus = await probeEmailPasswordProvider();
});
let rulesStatus = null;
test.beforeAll(async () => {
  rulesStatus = await probeFirestoreRules();
});

function guard() {
  if (!providerStatus?.ok) test.skip(true, `auth: ${providerStatus?.reason}`);
  if (!rulesStatus?.ok) test.skip(true, `rules: ${rulesStatus?.reason}`);
}

test.afterEach(async ({ page, context }) => {
  await resetClient(page, context);
});

test.describe('NoteHub — profile', () => {
  test('profile modal opens, saves name + bio, reflects in auth slot', async ({ page }) => {
    guard();
    await mockDriveBridge(page);
    const email = uniqueEmail('profile');
    const { skipped, reason } = await registerUser(page, providerStatus, email);
    if (skipped) test.skip(true, reason);

    await page.locator('#profile-btn').click();
    await page.locator('#profile-modal').waitFor({ state: 'visible' });

    const name = `Tester ${Date.now()}`;
    const bio = `Bio ${Date.now()}`;
    await page.locator('#profile-name').fill(name);
    await page.locator('#profile-bio').fill(bio);
    await page.locator('#profile-submit').click();
    await page.locator('#profile-modal').waitFor({ state: 'hidden', timeout: 10_000 });

    // Auth slot should now show the display name
    await expect(page.locator('.auth-slot__email')).toHaveText(name);
  });

  test('Gravatar email affects the avatar preview', async ({ page }) => {
    guard();
    await mockDriveBridge(page);
    const { skipped, reason } = await registerUser(page, providerStatus, uniqueEmail('grav'));
    if (skipped) test.skip(true, reason);

    await page.locator('#profile-btn').click();
    await page.locator('#profile-modal').waitFor({ state: 'visible' });

    // Set a Gravatar email and verify the avatar preview hides the initials
    // (i.e. switches to an <img>).
    await page.locator('#profile-gravatar').fill('nonexistent@example.com');
    // js-md5 is loaded from CDN; give it a moment to populate.
    await page.waitForTimeout(500);
    const previewImg = page.locator('#profile-avatar-preview img');
    await expect(previewImg).toHaveCount(1);
  });
});
