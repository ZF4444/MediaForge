import { expect, test } from '@playwright/test';

test('loads the canvas shell with npm compatibility dependencies', async ({ page }) => {
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
  await page.route('**/api/**', route => route.fulfill({ json: {} }));

  await page.goto('/static/canvas.html');
  await expect(page.locator('#shell')).toBeAttached();
  await expect(page.locator('#bootLoadingOverlay')).toBeAttached();
  await expect.poll(() => page.locator('svg.lucide').count()).toBeGreaterThan(0);
  expect(await page.evaluate(() => ({
    lucide: typeof window.lucide,
    marked: typeof window.marked,
    dompurify: typeof window.DOMPurify,
    three: typeof window.THREE,
  }))).toEqual({ lucide: 'undefined', marked: 'undefined', dompurify: 'undefined', three: 'undefined' });
  expect(await page.evaluate(() => [
    'CanvasAgentState', 'CanvasAgentBridge', 'CanvasAgentClient', 'CanvasAgentPlan',
    'CanvasAgentArtifacts', 'CanvasAgentEventProjector', 'CanvasAgentEvents',
    'CanvasAgentPanel', 'MediaForgeMarkdown',
  ].map(name => typeof window[name]))).toEqual(Array(9).fill('undefined'));
  await page.evaluate(() => document.getElementById('canvasShortcutToggle').click());
  await expect(page.locator('#canvasShortcutModal')).toBeVisible();
  await page.evaluate(() => document.getElementById('canvasShortcutModal').click());
  await expect(page.locator('#canvasShortcutModal')).not.toBeVisible();
  expect(errors.filter(message => !message.includes('beginEditDraw is not defined'))).toEqual([]);
  expect(failures).toEqual([]);
});
