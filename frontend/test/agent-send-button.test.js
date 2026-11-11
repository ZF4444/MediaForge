import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../src/canvas/agent/agent-panel.js', import.meta.url), 'utf8');

// Extract setActionMode and run it against a minimal button double.
function actionModeSandbox() {
  const start = source.indexOf('function setActionMode(mode){');
  const end = source.indexOf('let confirmationPending', start);
  const body = source.slice(start, end);
  const attrs = {};
  const button = {
    dataset: {}, title: '', disabled: false, innerHTMLWrites: 0, _html: '',
    setAttribute(name, value) { attrs[name] = value; },
    get innerHTML() { return this._html; },
    set innerHTML(value) { this._html = value; this.innerHTMLWrites += 1; },
  };
  const context = {
    state: { busy: false },
    cancelling: false,
    actionMode: 'send',
    $: () => button,
    window: { lucide: { calls: 0, createIcons() { this.calls += 1; } } },
  };
  vm.createContext(context);
  vm.runInContext(`${body}; globalThis.setActionMode = setActionMode;`, context);
  return { context, button, attrs };
}

describe('Agent send button', () => {
  it('does not rebuild the icon while the mode is unchanged', () => {
    const { context, button } = actionModeSandbox();
    context.setActionMode('cancel');
    const writes = button.innerHTMLWrites;
    const icons = context.window.lucide.calls;
    for (let i = 0; i < 5; i += 1) context.setActionMode('cancel');
    expect(button.innerHTMLWrites).toBe(writes);
    expect(context.window.lucide.calls).toBe(icons);
  });

  it('swaps the icon when the mode changes', () => {
    const { context, button, attrs } = actionModeSandbox();
    context.setActionMode('cancel');
    expect(button._html).toContain('square');
    expect(attrs['aria-label']).toBe('取消运行');
    context.setActionMode('send');
    expect(button._html).toContain('"send"');
    expect(attrs['aria-label']).toBe('发送');
  });

  it('still refreshes the disabled state without touching the icon', () => {
    const { context, button } = actionModeSandbox();
    context.setActionMode('send');
    const writes = button.innerHTMLWrites;
    context.state.busy = true;
    context.setActionMode('send');
    expect(button.disabled).toBe(true);
    expect(button.innerHTMLWrites).toBe(writes);
  });
});
