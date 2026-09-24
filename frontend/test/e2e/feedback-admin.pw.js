import { expect, test } from '@playwright/test';

test('loads and updates feedback through the page service', async ({ page }) => {
  const errors = [];
  const savedPayloads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem('studio_theme', 'light'));

  await page.route('**/api/feedback/admin**', async route => {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const path = new URL(url).pathname;
    if (method === 'GET' && path === '/api/feedback/admin') {
      await route.fulfill({ json: { total: 1, items: [{
        id: 'feedback-1',
        username: 'Casey',
        user_id: 'user-1',
        content: 'The export button is hard to find.',
        status: 'open',
        type: 'idea',
        page: 'canvas',
        created_at: 1,
        updated_at: 2,
        admin_note: '',
        user_agent: 'Playwright',
      }] } });
      return;
    }
    if (method === 'PATCH' && path === '/api/feedback/admin/feedback-1') {
      savedPayloads.push(request.postDataJSON());
      await route.fulfill({ json: { item: {
        id: 'feedback-1',
        username: 'Casey',
        user_id: 'user-1',
        content: 'The export button is hard to find.',
        status: 'resolved',
        type: 'idea',
        page: 'canvas',
        created_at: 1,
        updated_at: 3,
        admin_note: 'Fixed in the next release.',
        user_agent: 'Playwright',
      } } });
      return;
    }
    await route.fulfill({ status: 404, json: { detail: `Unexpected ${method} ${path}` } });
  });

  await page.goto('/static/feedback-admin.html');
  await expect(page.locator('#fbList')).toContainText('The export button is hard to find.');
  await expect(page.locator('#fbStatus')).toHaveText('共 1 条。');
  await page.locator('#fbAdminNote').fill('Fixed in the next release.');
  await page.locator('[data-status="resolved"]').click();
  await expect(page.locator('#fbStatus')).toHaveText('已保存。');
  await expect(page.locator('#fbAdminNote')).toHaveValue('Fixed in the next release.');
  expect(savedPayloads).toEqual([{ status: 'resolved', admin_note: 'Fixed in the next release.' }]);
  expect(errors).toEqual([]);
});
