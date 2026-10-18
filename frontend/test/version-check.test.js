import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function classList() {
  const set = new Set();
  return { add: name => set.add(name), remove: name => set.delete(name), has: name => set.has(name) };
}

describe('index version check', () => {
  let toast;
  let overlay;
  let versions;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    toast = { classList: classList() };
    overlay = { classList: classList() };
    versions = [];
    vi.stubGlobal('document', {
      getElementById: id => ({ versionToast: toast, versionForceOverlay: overlay })[id],
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => versions.shift() })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function pollTwice(first, second) {
    versions.push(first, second);
    await import('../src/index/version-check.js');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60 * 1000);
  }

  it('shows the dismissible toast when only the patch version changes', async () => {
    await pollTwice('1.1.277', '1.1.330');
    expect(toast.classList.has('is-visible')).toBe(true);
    expect(overlay.classList.has('is-visible')).toBe(false);
  });

  it('shows the forced overlay when the major or minor version changes', async () => {
    await pollTwice('1.1.330', '1.2.0');
    expect(overlay.classList.has('is-visible')).toBe(true);
    expect(toast.classList.has('is-visible')).toBe(false);
  });
});
