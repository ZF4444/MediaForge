import { expect, test } from '@playwright/test';

const legacyPages = [
  'index',
  'login',
  'canvas',
  'asset-manager',
  'storage-manager',
  'storage-quota',
  'comfyui-settings',
  'workflow-config',
  'workflow-settings',
  'rh-workflow-settings',
  'ai-connections',
  'canvas-manager',
  'access-control',
  'broadcast-admin',
  'user-management',
  'my-account',
  'user-data-migration',
  'fbx-node-picker',
  'api-settings',
  'gaussian',
  'gaussian-viewer',
  'pose-studio',
  'gpt-chat',
  'feedback-admin',
  'angle',
  'vnccs-pose-studio-embed',
];

test('preserves legacy static page URLs in the Vite output', async ({ request }) => {
  const results = await Promise.all(legacyPages.map(async page => {
    const response = await request.get(`/static/${page}.html`);
    return {
      page,
      status: response.status(),
      body: await response.text(),
    };
  }));

  for (const { page, status, body } of results) {
    expect(status, `${page} should remain reachable`).toBe(200);
    expect(body, `${page} should be HTML`).toMatch(/<!doctype html>/i);
    expect(body, `${page} should not reference removed vendor URLs`).not.toMatch(/\/static\/vendor\//i);
  }

  expect(results.find(({ page }) => page === 'canvas').body).toMatch(/(?:\/static\/dist\/|\/src\/canvas\/runtime\.js)/);
  const vnccsBody = results.find(({ page }) => page === 'vnccs-pose-studio-embed').body;
  expect(vnccsBody).toMatch(/(?:\/static\/dist\/vnccs-pose-studio-embed\/main\.js|\/src\/vnccs\/embed-runtime\.js)/);
});

test('serves cacheable built assets without legacy vendor references', async ({ request }) => {
  const response = await request.get('/static/dist/gpt-chat/main.js');
  test.skip(response.status() === 404, 'Vite dev server serves source modules; production build verifies static/dist assets');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/javascript/);
  expect(response.headers()['cache-control'] || '').not.toMatch(/no-store/i);
  expect(await response.text()).not.toMatch(/static\/vendor/);
});
