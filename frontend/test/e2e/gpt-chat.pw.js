import { expect, test } from '@playwright/test';

test('loads the frontend-owned GPT chat page without browser errors', async ({ page }) => {
  const errors = [];
  const missing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/ai/configuration') {
      await route.fulfill({ json: { connections: [], models: [], resources: [] } });
    } else if (path === '/api/conversations') {
      if (route.request().method() === 'POST') {
        await route.fulfill({ json: { conversation: { id: 'new-thread', title: '新对话', messages: [] } } });
      } else {
        await route.fulfill({ json: { conversations: [] } });
      }
    } else {
      await route.fulfill({ json: {} });
    }
  });

  await page.goto('/static/gpt-chat.html');
  await page.evaluate(() => localStorage.setItem('studio_theme', 'light'));
  await page.reload();
  await expect(page.locator('#chatTitle')).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/studio-theme-dark/);
  await expect(page.locator('#messages')).toBeVisible();
  await expect(page.locator('#threadList')).toBeAttached();
  await expect(page.locator('#messageInput')).toHaveAttribute('placeholder', '输入消息，Enter 发送...');
  await page.locator('[data-action="toggle-history"]').click();
  await expect(page.locator('#historyPopover')).toHaveClass(/open/);
  await page.locator('[data-action="toggle-system-prompt"]').click();
  await expect(page.locator('#systemPromptPopover')).toHaveClass(/open/);
  await page.locator('[data-action="close-system-prompt"]').click();
  await page.locator('[data-action="new-conversation"]').first().click();
  await expect(page.locator('#chatTitle')).toHaveText('新对话');
  const themeSyncPage = await page.context().newPage();
  await themeSyncPage.goto('/static/gpt-chat.html');
  await themeSyncPage.evaluate(() => localStorage.setItem('studio_theme', 'dark'));
  await expect(page.locator('html')).toHaveClass(/studio-theme-dark/);
  await themeSyncPage.close();
  expect(await page.evaluate(() => typeof window.StudioTheme)).toBe('undefined');
  expect(page.url()).toContain('/static/gpt-chat.html');
  expect(missing).toEqual([]);
  expect(errors).toEqual([]);
});
