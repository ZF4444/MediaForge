import { expect, test } from '@playwright/test';

for (const [path, title] of [
  ['/static/asset-manager.html', '素材库管理'],
  ['/static/storage-manager.html', '空间管理'],
]) {
  test(`loads ${title} using npm icons`, async ({ page }) => {
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
      if (pathname === '/api/asset-library') {
        await route.fulfill({ json: { library: { libraries: [], categories: [] } } });
      } else if (pathname === '/api/prompt-libraries') {
        await route.fulfill({ json: { library: { libraries: [] } } });
      } else if (pathname === '/api/ai/resources') {
        await route.fulfill({ json: { connections: [], models: [] } });
      } else if (pathname === '/api/access-control/me') {
        await route.fulfill({ json: { user_id: 'test-user', pages: [] } });
      } else if (pathname === '/api/storage/usage') {
        await route.fulfill({ json: { usage_by_category: [] } });
      } else if (pathname === '/api/storage/files') {
        await route.fulfill({ json: { entries: [], total_matches: 0, current_page: 1, limit: 50 } });
      } else if (pathname === '/api/local-assets' || pathname === '/api/shared-folders') {
        await route.fulfill({ json: { items: [], folders: [] } });
      } else {
        await route.fulfill({ json: {} });
      }
    });

    await page.goto(path);
    await expect(page.locator('.asset-title')).toHaveText(title);
    expect(await page.evaluate(() => typeof window.StudioTheme)).toBe('undefined');
    await expect(page.locator('#assetManagerRoot')).toBeAttached();
    await page.locator('#refreshBtn').click();
    await expect(page.locator('#assetStatus')).toHaveText('准备就绪');
    expect(await page.evaluate(() => document.querySelectorAll('svg.lucide').length)).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
}

test('shows the ESM quota dialog when an asset upload exceeds storage', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/asset-library') {
      await route.fulfill({ json: { library: { libraries: [{
        id: 'default', name: 'Default', categories: [{ id: 'images', name: 'Images', type: 'image', items: [] }],
      }], categories: [] } } });
    } else if (pathname === '/api/prompt-libraries') {
      await route.fulfill({ json: { library: { libraries: [] } } });
    } else if (pathname === '/api/ai/resources') {
      await route.fulfill({ json: { connections: [], models: [] } });
    } else if (pathname === '/api/access-control/me') {
      await route.fulfill({ json: { user_id: 'test-user', pages: [] } });
    } else if (pathname === '/api/storage/usage') {
      await route.fulfill({ json: { quota_bytes: 2 * 1024 ** 3, used_bytes: 2 * 1024 ** 3, usage_by_category: [] } });
    } else if (pathname === '/api/ai/upload') {
      await route.fulfill({ status: 413, json: { detail: 'storage quota exceeded' } });
    } else if (pathname === '/api/local-assets' || pathname === '/api/shared-folders') {
      await route.fulfill({ json: { items: [], folders: [] } });
    } else {
      await route.fulfill({ json: {} });
    }
  });

  await page.goto('/static/asset-manager.html');
  await expect(page.locator('[data-asset-upload]')).toBeEnabled();
  await page.locator('#assetUploadInput').setInputFiles({
    name: 'test.png',
    mimeType: 'image/png',
    buffer: Buffer.from('png'),
  });
  await expect(page.locator('#storageQuotaExceededDialog')).toBeVisible();
  await expect(page.locator('#storageQuotaExceededDialog')).toContainText('存储空间不足');
  await expect(page.locator('#assetStatus')).toHaveText('存储空间不足');
  expect(await page.evaluate(() => typeof window.MediaForgeUpload)).toBe('undefined');
  expect(errors).toEqual([]);
});
