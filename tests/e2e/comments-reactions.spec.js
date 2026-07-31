import { test, expect } from '@playwright/test';
import path from 'node:path';
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

test.describe('NoteHub — comments + reactions', () => {
  test('post a top-level comment and a reply', async ({ page }) => {
    guard();
    await mockDriveBridge(page);
    const { skipped, reason } = await registerUser(page, providerStatus, uniqueEmail('comm_user'));
    if (skipped) test.skip(true, reason);

    // Upload a note so we have something to comment on
    const title = `Commentable Note ${Date.now()}`;
    await page.locator('#share-fab').click();
    await page.locator('#upload-modal').waitFor({ state: 'visible' });
    await page.locator('#upload-form input[name="title"]').fill(title);
    await page.locator('#upload-form input[name="creator"]').fill('Tester');
    await page.locator('#upload-form input[name="course"]').fill('CS 100');
    await page.locator('input[type="file"]').setInputFiles('tests/e2e/fixtures/sample.txt');
    await page.locator('#upload-submit').click();
    await page.locator('#upload-modal').waitFor({ state: 'hidden', timeout: 30_000 });
    const card = page.locator('#notes-grid article.note', { hasText: title });
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Open the drawer
    await card.locator('button[data-open-note]').click();
    await page.locator('#note-drawer').waitFor({ state: 'visible' });

    // Post a top-level comment
    const top = `Top-level comment ${Date.now()}`;
    await page.locator('#comment-body').fill(top);
    await page.locator('#comment-form button[type="submit"]').click();
    const topComment = page.locator('#drawer-body .comment', { hasText: top }).first();
    await expect(topComment).toBeVisible({ timeout: 10_000 });

    // Reply to it
    const reply = `Reply ${Date.now()}`;
    await topComment.locator('button.comment__reply').click();
    await page.locator('#comment-body').fill(reply);
    await page.locator('#comment-form button[type="submit"]').click();
    const replyComment = page.locator('#drawer-body .comment--reply', { hasText: reply }).first();
    await expect(replyComment).toBeVisible({ timeout: 10_000 });
  });

  test('upvote toggles and persists', async ({ page }) => {
    guard();
    await mockDriveBridge(page);
    const { skipped, reason } = await registerUser(page, providerStatus, uniqueEmail('react_user'));
    if (skipped) test.skip(true, reason);

    // Upload a note
    const title = `Reactable Note ${Date.now()}`;
    await page.locator('#share-fab').click();
    await page.locator('#upload-modal').waitFor({ state: 'visible' });
    await page.locator('#upload-form input[name="title"]').fill(title);
    await page.locator('#upload-form input[name="creator"]').fill('Tester');
    await page.locator('#upload-form input[name="course"]').fill('CS 100');
    await page.locator('input[type="file"]').setInputFiles(path.join(fixtureDir, 'sample.txt'));
    await page.locator('#upload-submit').click();
    await page.locator('#upload-modal').waitFor({ state: 'hidden', timeout: 30_000 });
    const card = page.locator('#notes-grid article.note', { hasText: title });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.locator('button[data-open-note]').click();
    await page.locator('#note-drawer').waitFor({ state: 'visible' });

    const upBtn = page.locator('#reactions-row [data-react]');
    await expect(upBtn).toBeVisible();
    await expect(upBtn).toContainText('0');

    // Toggle on
    await upBtn.click();
    await expect(upBtn).toContainText('1');
    await expect(upBtn).toHaveClass(/reaction-pill--active/);

    // Toggle off
    await upBtn.click();
    await expect(upBtn).toContainText('0');
  });
});
