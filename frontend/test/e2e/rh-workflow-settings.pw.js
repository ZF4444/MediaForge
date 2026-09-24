import { expect, test } from '@playwright/test';

test('loads RunningHub workflow settings with npm icons', async ({ page }) => {
  const errors = [];
  const failures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`${message.text()} ${message.location().url}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => localStorage.setItem('studio_theme', 'light'));
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/ai/configuration') {
      await route.fulfill({ json: { connections: [], models: [], resources: [] } });
    } else {
      await route.fulfill({ json: {} });
    }
  });

  await page.goto('/static/rh-workflow-settings.html');
  await expect(page.locator('.rh-head h1')).toHaveText('RH 应用');
  await expect(page.locator('#rhAppsList')).toContainText('粘贴 /run/ai-app/... 后点击创建');
  expect(await page.evaluate(() => typeof window.lucide)).toBe('undefined');
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});
