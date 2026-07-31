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

async function createOpenGroup(page, name) {
  await page.locator('.margin__tab[data-tab="groups"]').click();
  await page.locator('#create-group-btn').click();
  await page.locator('#group-modal').waitFor({ state: 'visible' });
  await page.locator('#group-name').fill(name);
  await page.locator('input[name="visibility"][value="open"]').check();
  await page.locator('#group-submit').click();
  await page.locator('#group-modal').waitFor({ state: 'hidden', timeout: 10_000 });
}

async function scheduleSession(page, title) {
  await page.locator('#schedule-session-btn').click();
  await page.locator('#session-modal').waitFor({ state: 'visible' });
  await page.locator('#session-name').fill(title);
  const start = new Date(Date.now() + 30 * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  const dtLocal =
    `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` +
    `T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  await page.locator('#session-starts').fill(dtLocal);
  await page.locator('#session-submit').click();
  await page.locator('#session-modal').waitFor({ state: 'hidden', timeout: 10_000 });
}

test.describe('NoteHub — notifications', () => {
  test('bell badge increments for new notifications and clears on mark-all', async ({ browser }) => {
    guard();

    const ownerCtx = await browser.newContext();
    try {
      const owner = await ownerCtx.newPage();
      await mockDriveBridge(owner);
      const r1 = await registerUser(owner, providerStatus, uniqueEmail('notif_owner'));
      if (r1.skipped) test.skip(true, r1.reason);

      const groupName = `Notif Group ${Date.now()}`;
      await createOpenGroup(owner, groupName);

      const memberCtx = await browser.newContext();
      try {
        const member = await memberCtx.newPage();
        await mockDriveBridge(member);
        const r2 = await registerUser(member, providerStatus, uniqueEmail('notif_member'));
        if (r2.skipped) test.skip(true, r2.reason);

        // Member joins via directory
        await member.locator('.margin__tab[data-tab="groups"]').click();
        const card = member.locator('#groups-directory .group-card', { hasText: groupName });
        await card.waitFor({ state: 'visible', timeout: 15_000 });
        await card.locator('button[data-join-group]').click();

        // Owner schedules session
        const sessionTitle = `Notif Session ${Date.now()}`;
        await scheduleSession(owner, sessionTitle);

        // Switch member to notifications — should have at least one unread
        await member.locator('.margin__tab[data-tab="notifs"]').click();
        await member.locator('[data-panel="notifs"]').waitFor({ state: 'visible' });
        const unreadRow = member.locator('.notif-row--unread', { hasText: sessionTitle });
        await expect(unreadRow).toBeVisible({ timeout: 15_000 });

        // Bell badge increments (in the sidebar tab strip)
        const badge = member.locator('#notif-count');
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText(/^[1-9]\d*$/);

        // Mark all read — the badge hides, rows lose "unread" class
        await member.locator('#notifs-mark-all').click();
        await expect(badge).toBeHidden();
        await expect(member.locator('.notif-row--unread')).toHaveCount(0);
      } finally {
        await memberCtx.close();
      }
    } finally {
      await ownerCtx.close();
    }
  });
});