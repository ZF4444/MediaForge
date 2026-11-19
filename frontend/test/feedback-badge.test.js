import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPendingFeedbackCount } from '../src/services/feedback-admin.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('feedback pending badge', () => {
  it('reads the pending count and normalizes bad values to 0', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ count: 5 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ count: -2 }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    expect(await getPendingFeedbackCount()).toBe(5);
    expect(await getPendingFeedbackCount()).toBe(0);
    expect(await getPendingFeedbackCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/feedback/admin/pending-count', { credentials: 'same-origin' });
  });

  it('places the badge inside the feedback sidebar pill, hidden by default', () => {
    const html = read('src/pages/index/index.html');
    const pill = html.slice(html.indexOf('id="nav-feedback-admin"'), html.indexOf('id="nav-broadcast-admin"'));
    expect(pill).toContain('id="feedbackPendingBadge"');
    expect(pill).toMatch(/class="side-pill-badge is-hidden"/);
  });

  it('only polls for users with feedback-admin permission and refreshes on admin changes', () => {
    const entry = read('src/index/main.js');
    expect(entry).toContain("if (allowed.has('feedback-admin')) startFeedbackBadge();");
    expect(entry).toContain("d.type === 'feedback-changed'");
    const page = read('src/pages/feedback-admin/main.js');
    expect(page.match(/notifyFeedbackChanged\(\);/g)?.length).toBe(2);
  });

  it('styles the badge as a red rounded rectangle with white text', () => {
    const css = read('src/pages/index/index.css');
    const rule = css.slice(css.indexOf('.side-pill-badge {'));
    const block = rule.slice(0, rule.indexOf('}'));
    expect(block).toContain('background:#ef4444');
    expect(block).toContain('color:#fff');
    expect(block).toMatch(/border-radius:\d+px/);
  });
});
