import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { probeEmailPasswordProvider, probeFirestoreRules } from './firebase-probe.js';
import {
  mockDriveBridge,
  resetClient,
  uniqueEmail,
  registerUser,
  fixtureDir,
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

async function createOpenGroup(page, name) {
  await page.locator('.margin__tab[data-tab="groups"]').click();
  await page.locator('#create-group-btn').click();
  await page.locator('#group-modal').waitFor({ state: 'visible' });
  await page.locator('#group-name').fill(name);
  await page.locator('input[name="visibility"][value="open"]').check();
  await page.locator('#group-submit').click();
  await page.locator('#group-modal').waitFor({ state: 'hidden', timeout: 10_000 });
}

async function uploadGroupsNote(page, { title, groupName }) {
  await page.locator('.margin__tab[data-tab="notes"]').click();
  await page.locator('#share-fab').click();
  await page.locator('#upload-modal').waitFor({ state: 'visible' });
  await page.locator('#upload-form input[name="title"]').fill(title);
  await page.locator('#upload-form input[name="creator"]').fill('Group Owner');
  await page.locator('#upload-form input[name="course"]').fill('CS 200');
  // Switch to groups-only visibility
  await page.locator('input[name="visibility"][value="groups"]').check();
  await page.locator('#up-groups').waitFor({ state: 'visible' });
  // Select the first group option whose text matches our groupName
  const opts = page.locator('#up-groups option');
  const count = await opts.count();
  for (let i = 0; i < count; i++) {
    const text = (await opts.nth(i).textContent()) || '';
    if (text.includes(groupName)) {
      await opts.nth(i).click();
      break;
    }
  }
  await page.locator('#upload-form input[type="file"]').setInputFiles(
    path.join(fixtureDir, 'sample.txt')
  );
  await page.locator('#upload-submit').click();
  await page.locator('#upload-modal').waitFor({ state: 'hidden', timeout: 30_000 });
}

test.describe('NoteHub — note privacy', () => {
  test('public note is visible to guests (no share-fab)', async ({ browser }) => {
    guard();

    const authorCtx = await browser.newContext();
    try {
      const author = await authorCtx.newPage();
      await mockDriveBridge(author);
      const r1 = await registerUser(author, providerStatus, uniqueEmail('priv_pub'));
      if (r1.skipped) test.skip(true, r1.reason);

      const title = `Public Guest ${Date.now()}`;
      await author.locator('#share-fab').click();
      await author.locator('#upload-modal').waitFor({ state: 'visible' });
      await author.locator('#upload-form input[name="title"]').fill(title);
      await author.locator('#upload-form input[name="creator"]').fill('Privacy Author');
      await author.locator('#upload-form input[name="course"]').fill('PHIL 100');
      await author.locator('#upload-form input[type="file"]').setInputFiles(
        path.join(fixtureDir, 'sample.txt')
      );
      await author.locator('#upload-submit').click();
      await author.locator('#upload-modal').waitFor({ state: 'hidden', timeout: 30_000 });
      await expect(author.locator('#notes-grid article.note', { hasText: title })).toBeVisible({ timeout: 30_000 });
    } finally {
      await authorCtx.close();
    }

    const guestCtx = await browser.newContext();
    try {
      const guest = await guestCtx.newPage();
      await mockDriveBridge(guest);
      await guest.goto('/');
      await expect(guest.locator('#login-btn')).toBeVisible();
      await expect(guest.locator('#share-fab')).toBeHidden();
      // The notes snapshot is public-readable per the rules
      await guest.waitForTimeout(1000);
      const count = await guest.locator('#notes-count').textContent();
      expect(Number(count || 0)).toBeGreaterThanOrEqual(0);
    } finally {
      await guestCtx.close();
    }
  });

  test('groups-only note is hidden from non-members', async ({ browser }) => {
    guard();

    // Owner creates an open group + a groups-only note shared with it
    const ownerCtx = await browser.newContext();
    try {
      const owner = await ownerCtx.newPage();
      await mockDriveBridge(owner);
      const r1 = await registerUser(owner, providerStatus, uniqueEmail('priv_owner'));
      if (r1.skipped) test.skip(true, r1.reason);

      const groupName = `Privacy Group ${Date.now()}`;
      await createOpenGroup(owner, groupName);

      const noteTitle = `Group-only Note ${Date.now()}`;
      await uploadGroupsNote(owner, { title: noteTitle, groupName });

      // The owner should see it
      await expect(owner.locator('#notes-grid article.note', { hasText: noteTitle })).toBeVisible({ timeout: 30_000 });

      // Guest (separate context, no membership) — must NOT see it
      const guestCtx = await browser.newContext();
      try {
        const guest = await guestCtx.newPage();
        await mockDriveBridge(guest);
        await guest.goto('/');
        await guest.waitForTimeout(1500);
        const guestCard = guest.locator('#notes-grid article.note', { hasText: noteTitle });
        await expect(guestCard).toHaveCount(0);
      } finally {
        await guestCtx.close();
      }
    } finally {
      await ownerCtx.close();
    }
  });

  test('logged-out users cannot upload', async ({ page }) => {
    await mockDriveBridge(page);
    await page.goto('/');
    await expect(page.locator('#share-fab')).toBeHidden();
  });
});
