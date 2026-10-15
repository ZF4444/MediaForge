import { describe, expect, it, vi } from 'vitest';
import { mountActionDelegation } from '../src/components/workflow-cover-picker.js';

function setup(target, boundary) {
  let dispatch;
  const close = vi.fn();
  const root = { contains: () => true, addEventListener: (_name, handler) => { dispatch = handler; } };
  mountActionDelegation(root, { close }, { capture: true });
  const event = { target: { closest: selector => selector === '[data-action]' ? target : boundary } };
  dispatch(event);
  return close;
}

describe('capture action delegation and modal boundaries', () => {
  it('does not invoke backdrop close for a log expand button inside the panel', () => {
    const panel = {};
    const backdrop = { dataset: { action: 'close' }, contains: node => node === panel };
    expect(setup(backdrop, panel)).not.toHaveBeenCalled();
  });

  it('still invokes a close button inside the panel', () => {
    const closeButton = { dataset: { action: 'close' }, contains: () => false };
    expect(setup(closeButton, {})).toHaveBeenCalledOnce();
  });

  it('still invokes close when the backdrop itself is clicked', () => {
    const backdrop = { dataset: { action: 'close' } };
    expect(setup(backdrop, null)).toHaveBeenCalledOnce();
  });
});
