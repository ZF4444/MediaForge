import { expect, test } from '@playwright/test';

test('loads ComfyUI settings with the migrated page runtime', async ({ page }) => {
  const errors = [];
  const failures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  await page.addInitScript(() => localStorage.setItem('studio_theme', 'light'));
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/workflows' || pathname === '/api/comfyui/instances') {
      await route.fulfill({ json: { workflows: [{ name: 'demo.json', title: 'Demo', field_count: 2 }] } });
    } else if (pathname.startsWith('/api/workflows/')) {
      await route.fulfill({ json: { workflow: { '1': { class_type: 'CheckpointLoaderSimple', inputs: {} }, '2': { class_type: 'SaveImage', inputs: { images: ['1', 0] } } }, config: { title: 'Demo', fields: [] } } });
    } else {
      await route.fulfill({ json: {} });
    }
  });

  await page.goto('/static/comfyui-settings.html');
  await expect(page.locator('.title').first()).toHaveText('ComfyUI工作流');
  await expect(page.locator('#status')).toBeAttached();
  await page.evaluate(() => document.getElementById('graphCard')?.style.setProperty('display', 'block'));
  await expect(page.locator('#graphCard')).toBeVisible();
  await page.locator('#workspaceCanvasTab').click();
  await page.evaluate(() => document.getElementById('miniCanvasHost')?.querySelector('#miniCanvas') || document.getElementById('workspaceCanvasTab')?.click());
  await expect(page.locator('#miniCanvas')).toBeAttached();
  await page.locator('.mini-tool').first().click();
  await expect(page.locator('.mini-card[data-node^="prompt_"]')).toHaveCount(2);
  expect(await page.evaluate(() => document.querySelectorAll('svg.lucide').length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => typeof window.lucide)).toBe('undefined');
  expect(await page.evaluate(() => typeof window.StudioTheme)).toBe('undefined');
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});
