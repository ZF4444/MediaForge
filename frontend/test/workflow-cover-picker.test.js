import { describe, expect, it, vi } from 'vitest';
import { mountWorkflowCoverPicker } from '../src/components/workflow-cover-picker.js';

function createControl() {
  const listeners = {};
  const classes = new Set();
  return {
    listeners,
    files: [],
    value: '',
    hidden: false,
    style: {},
    classList: {
      toggle(name, value) { value ? classes.add(name) : classes.delete(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, callback) { listeners[type] = callback; },
    removeEventListener(type, callback) { if (listeners[type] === callback) delete listeners[type]; },
    querySelector() { return { textContent: '' }; },
  };
}

describe('workflow cover picker component', () => {
  it('uploads images, updates preview and clears the input', async () => {
    const root = createControl();
    const input = createControl();
    const removeButton = createControl();
    const file = { type: 'image/png', name: 'cover.png' };
    const upload = vi.fn().mockResolvedValue({ url: '/cover.png' });
    const onChange = vi.fn();
    input.files = [file];
    const control = mountWorkflowCoverPicker({ root, input, removeButton, upload, onChange });

    await input.listeners.change();

    expect(upload).toHaveBeenCalledWith(file);
    expect(root.style.backgroundImage).toBe('url("/cover.png")');
    expect(removeButton.hidden).toBe(false);
    expect(input.value).toBe('');
    expect(onChange).toHaveBeenCalledWith({ cover: { url: '/cover.png' } });
    control.setCover({ file_id: 'cover id' });
    expect(root.style.backgroundImage).toBe('');
  });

  it('rejects non-image files and supports removing a cover', async () => {
    const root = createControl();
    const input = createControl();
    const removeButton = createControl();
    const upload = vi.fn();
    const onChange = vi.fn();
    input.files = [{ type: 'application/pdf' }];
    mountWorkflowCoverPicker({
      root, input, removeButton, initialCover: { url: '/existing.png' }, upload, onChange,
    });

    await input.listeners.change();
    expect(upload).not.toHaveBeenCalled();
    expect(onChange.mock.calls[0][0].error.message).toContain('图片');
    removeButton.listeners.click();
    expect(onChange).toHaveBeenLastCalledWith({ cover: {} });
    expect(removeButton.hidden).toBe(true);
  });

  it('detaches listeners and ignores pending UI updates after destroy', async () => {
    const root = createControl();
    const input = createControl();
    const removeButton = createControl();
    let resolveUpload;
    const upload = vi.fn(() => new Promise(resolve => { resolveUpload = resolve; }));
    const onChange = vi.fn();
    input.files = [{ type: 'image/png', name: 'cover.png' }];
    const control = mountWorkflowCoverPicker({ root, input, removeButton, upload, onChange });
    const pending = input.listeners.change();
    control.destroy();
    resolveUpload({ url: '/late.png' });
    await pending;

    expect(input.listeners.change).toBeUndefined();
    expect(removeButton.listeners.click).toBeUndefined();
    expect(root.style.backgroundImage).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });
});
