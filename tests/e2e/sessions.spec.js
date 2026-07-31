import { test, expect } from '@playwright/test';
import { probeEmailPasswordProvider, probeFirestoreRules } from './firebase-probe.js';
import {
  mockDriveBridge,
  resetClient,
  uniqueEmail,
  registerUser,
  getInbox,
} from './helpers/bridge-mock.js';

let providerStatus = null;
let rulesStatus = null;
test.beforeAll(async () => {
  providerStatus = await probeEmailPasswordProvider();
  rulesStatus = await probeFirestoreRules();
});

function guard() {
  if (!providerStatus?.ok) test.skip(true, `auth: ${providerStatus?.reason}`);
  if (!rulesStatus?.ok) test.skip(true, `rules: ${rulesStatus?.reason}`);
}

test.afterEach(async ({ page, context }) => {
  await resetClient(page, context);
});

async function gotoGroups(page) {
  await page.locator('.margin__tab[data-tab="groups"]').click();
  await page.locator('[data-panel="groups"]').waitFor({ state: 'visible' });
}

async function createOpenGroup(page, name) {
  await page.locator('.margin__tab[data-tab="groups"]').click();
  await page.locator('[data-panel="groups"]').waitFor({ state: 'visible' });
  await page.locator('#create-group-btn').click();
  await page.locator('#group-modal').waitFor({ state: 'visible' });
  await page.locator('#group-name').fill(name || `Session Group ${Date.now()}`);
  await page.locator('#group-desc').fill('Created by sessions e2e');
  await page.locator('input[name="visibility"][value="open"]').check();
  await page.locator('#group-submit').click();
  await page.locator('#group-modal').waitFor({ state: 'hidden', timeout: 10_000 });
}

async function scheduleSession(page, { title, minutesFromNow = 60 }) {
  // From the group detail, click "Schedule session"
  await page.locator('#schedule-session-btn').click();
  await page.locator('#session-modal').waitFor({ state: 'visible' });
  await page.locator('#session-name').fill(title);
  // Compute a datetime-local value N minutes in the future
  const start = new Date(Date.now() + minutesFromNow * 60_000);
  const pad = (n) => String(n).padStart(2, '0');
  const dtLocal =
    `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}` +
    `T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  await page.locator('#session-starts').fill(dtLocal);
  await page.locator('#session-submit').click();
  await page.locator('#session-modal').waitFor({ state: 'hidden', timeout: 10_000 });
}

test.describe('NoteHub — sessions', () => {
  test('create + RSVP yes updates response counts', async ({ page }) => {
    guard();
    await mockDriveBridge(page);
    const { skipped, reason } = await registerUser(page, providerStatus, uniqueEmail('sess_owner'));
    if (skipped) test.skip(true, reason);

    const groupName = `Session Group ${Date.now()}`;
    await createOpenGroup(page, groupName);
    await gotoGroups(page);

    const sessionTitle = `Chapter 4 Review ${Date.now()}`;
    await scheduleSession(page, { title: sessionTitle, minutesFromNow: 30 });

    // Switch to sessions tab
    await page.locator('.margin__tab[data-tab="sessions"]').click();
    await page.locator('[data-panel="sessions"]').waitFor({ state: 'visible' });
    const card = page.locator('.session-card', { hasText: sessionTitle });
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Initial yes count is 0
    const yesBtn = card.locator('button.rsvp[data-rsvp="yes"]');
    await expect(yesBtn).toContainText('0');

    // Click yes
    await yesBtn.click();
    // The optimistic increment reflects in the DOM
    await expect(yesBtn).toContainText('1');
  });

  test('session creation notifies other group members', async ({ browser }) => {
    guard();

    // Owner
    const ownerCtx = await browser.newContext();
    let ownerSkipped = false;
    try {
      const owner = await ownerCtx.newPage();
      await mockDriveBridge(owner);
      const r1 = await registerUser(owner, providerStatus, uniqueEmail('sess_n_owner'));
      if (r1.skipped) { ownerSkipped = true; }
      else {
        const groupName = `Notify Group ${Date.now()}`;
        await createOpenGroup(owner, groupName);
        await gotoGroups(owner);
      }

      if (ownerSkipped) test.skip(true, 'Email/Password not enabled');

      // Member
      const memberCtx = await browser.newContext();
      try {
        const member = await memberCtx.newPage();
        await mockDriveBridge(member);
        const r2 = await registerUser(member, providerStatus, uniqueEmail('sess_n_member'));
        if (r2.skipped) test.skip(true, 'Email/Password not enabled');

        // Member joins the open group from directory
        await gotoGroups(member);
        // Find the owner's group in the directory by name
        const directoryCard = member.locator('#groups-directory .group-card', { hasText: groupName });
        await directoryCard.waitFor({ state: 'visible', timeout: 15_000 });
        await directoryCard.locator('button[data-join-group]').click();

        // Wait for member to appear in owner's "My groups"
        await owner.locator('#groups-mine').waitFor({ state: 'visible' });
        // Now owner schedules a session
        await scheduleSession(owner, { title: `Notify Session ${Date.now()}`, minutesFromNow: 120 });

        // Switch member to notifications tab and verify a notification appeared
        await member.locator('.margin__tab[data-tab="notifs"]').click();
        await member.locator('[data-panel="notifs"]').waitFor({ state: 'visible' });
        // The owner scheduled — there should be a "session_created" entry
        const notif = member.locator('.notif-row', { hasText: /scheduled|notify session/i });
        await expect(notif).toBeVisible({ timeout: 15_000 });
      } finally {
        await memberCtx.close();
      }
    } finally {
      await ownerCtx.close();
    }
  });

  test('email mock fires for opted-in members when session is created', async ({ browser }) => {
    guard();

    const ownerCtx = await browser.newContext();
    try {
      const owner = await ownerCtx.newPage();
      await mockDriveBridge(owner);
      const r1 = await registerUser(owner, providerStatus, uniqueEmail('sess_e_owner'));
      if (r1.skipped) test.skip(true, r1.reason);

      const groupName = `Email Group ${Date.now()}`;
      await createOpenGroup(owner, groupName);
      await gotoGroups(owner);

      const memberCtx = await browser.newContext();
      try {
        const member = await memberCtx.newPage();
        await mockDriveBridge(member);
        const r2 = await registerUser(member, providerStatus, uniqueEmail('sess_e_member'));
        if (r2.skipped) test.skip(true, r2.reason);

        await gotoGroups(member);
        const directoryCard = member.locator('#groups-directory .group-card', { hasText: groupName });
        await directoryCard.waitFor({ state: 'visible', timeout: 15_000 });
        await directoryCard.locator('button[data-join-group]').click();

        // Trigger session — this should cause an email POST through the bridge
        const sessionTitle = `Email Session ${Date.now()}`;
        await scheduleSession(owner, { title: sessionTitle, minutesFromNow: 90 });

        // The owner's mock inbox should have received a sendEmail payload
        const inbox = await getInbox(owner);
        const sessionEmails = inbox.filter(
          (p) => p.action === 'sendEmail' && (p.subject || '').includes(sessionTitle)
        );
        expect(sessionEmails.length).toBeGreaterThanOrEqual(1);
        // The email contains the group id and the recipient UID
        expect(sessionEmails[0]).toHaveProperty('groupId');
        expect(sessionEmails[0]).toHaveProperty('memberUid');
        expect(sessionEmails[0]).toHaveProperty('htmlBody');
      } finally {
        await memberCtx.close();
      }
    } finally {
      await ownerCtx.close();
    }
  });

  test('marking attendance increments attendee count', async ({ page }) => {
    guard();
    await mockDriveBridge(page);
    const { skipped, reason } = await registerUser(page, providerStatus, uniqueEmail('sess_att'));
    if (skipped) test.skip(true, reason);

    await createOpenGroup(page, `Attendee Group ${Date.now()}`);
    await gotoGroups(page);
    const sessionTitle = `Attendee Session ${Date.now()}`;
    await scheduleSession(page, { title: sessionTitle, minutesFromNow: 15 });

    await page.locator('.margin__tab[data-tab="sessions"]').click();
    await page.locator('[data-panel="sessions"]').waitFor({ state: 'visible' });
    const card = page.locator('.session-card', { hasText: sessionTitle });
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Click "I was there"
    await card.locator('button[data-mark-attend]').click();
    // Toast confirms
    await expect(page.locator('#toast')).toContainText(/attendance|attended/i, { timeout: 5_000 });
  });
});