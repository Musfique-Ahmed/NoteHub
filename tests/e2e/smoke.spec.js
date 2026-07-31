import { test, expect } from '@playwright/test';

test.describe('NoteHub — smoke', () => {
  test('home page loads and renders the core shell', async ({ page }) => {
    const fatalErrors = [];
    page.on('pageerror', (e) => fatalErrors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        if (/Failed to load resource: net::ERR_BLOCKED_BY_CLIENT|Favicon/i.test(t)) return;
        fatalErrors.push(`console.error: ${t}`);
      }
    });

    const response = await page.goto('/');
    expect(response?.status(), 'page should return 2xx').toBeLessThan(400);

    await expect(page).toHaveTitle(/Margin|NoteHub/);

    // Margin (sidebar) wordmark
    await expect(page.locator('.margin__wordmark-name')).toBeVisible();

    // Search
    const search = page.locator('#search');
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('placeholder', /title|creator|course/i);

    // Logged out → Sign in + Register visible, Pin FAB hidden
    await expect(page.locator('#login-btn')).toBeVisible();
    await expect(page.locator('#register-btn')).toBeVisible();
    await expect(page.locator('#share-fab')).toBeHidden();

    // Notes grid container
    await expect(page.locator('#notes-grid')).toBeAttached();
    await expect(page.locator('#notes-count')).toBeAttached();

    expect(fatalErrors, fatalErrors.join('\n')).toEqual([]);
  });

  test('search input accepts typing without throwing', async ({ page }) => {
    await page.goto('/');
    const search = page.locator('#search');
    await search.fill('algebra');
    await expect(search).toHaveValue('algebra');
    await expect(page.locator('#notes-grid')).toBeAttached();
  });

  test('date stamp renders a real month and weekday', async ({ page }) => {
    await page.goto('/');
    const month = await page.locator('#ds-month').textContent();
    const weekday = await page.locator('#ds-weekday').textContent();
    expect(month?.trim().length).toBeGreaterThan(0);
    expect(weekday?.trim().length).toBeGreaterThan(0);
  });

  test('tab strip mounts all four panels', async ({ page }) => {
    await page.goto('/');
    const tabs = page.locator('.margin__tab');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText(/notes/i);
    await expect(tabs.nth(1)).toHaveText(/groups/i);
    await expect(tabs.nth(2)).toHaveText(/sessions/i);
    await expect(tabs.nth(3)).toHaveText(/notifications/i);

    // Default tab is notes
    await expect(page.locator('[data-panel="notes"]')).toBeVisible();
    await expect(page.locator('[data-panel="groups"]')).toBeHidden();
    await expect(page.locator('[data-panel="sessions"]')).toBeHidden();
    await expect(page.locator('[data-panel="notifs"]')).toBeHidden();

    // Switch to groups — sessions panel hides, groups panel shows
    await tabs.nth(1).click();
    await expect(page.locator('[data-panel="groups"]')).toBeVisible();
    await expect(page.locator('[data-panel="sessions"]')).toBeHidden();
    await expect(page.locator('[data-panel="notes"]')).toBeHidden();
  });

  test('groups panel renders for guests', async ({ page }) => {
    await page.goto('/');
    await page.locator('.margin__tab[data-tab="groups"]').click();
    await expect(page.locator('[data-panel="groups"]')).toBeVisible();
    // The directory regions must be attached
    await expect(page.locator('#groups-mine')).toBeAttached();
    await expect(page.locator('#groups-directory')).toBeAttached();
  });
});