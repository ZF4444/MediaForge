import { expect, test } from '@playwright/test';

test('loads VNCCS embed from bundled npm modules', async ({ page }) => {
  const errors = [];
  const failures = [];
  const legacyVendorRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', request => {
    if (request.url().includes('/static/vendor/js/vnccs/')) legacyVendorRequests.push(request.url());
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));

  await page.goto('/static/vnccs-pose-studio-embed.html');
  await expect(page.locator('#host')).toBeAttached();
  await expect.poll(() => page.evaluate(() => typeof window.__VNCCS_STANDALONE_EXTENSION__)).toBe('object');
  expect(failures).toEqual([]);
  expect(legacyVendorRequests).toEqual([]);
  expect(errors).toEqual([]);
});
