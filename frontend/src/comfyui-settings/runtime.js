import '@tailwindcss/browser';
import 'virtual:mediaforge-i18n';
import 'virtual:mediaforge-theme';
import * as comfyUiActions from 'virtual:comfyui-settings-features';

// The embedding workflow-config page drives saving through this same-origin
// iframe boundary (iframe.contentWindow.onSave). Module exports are not window
// properties, so expose the one entry point it needs explicitly.
window.onSave = comfyUiActions.onSave;

const actionArgs = (element, event) => {
  let args = [];
  if (element.dataset.actionArgs) {
    try { args = JSON.parse(element.dataset.actionArgs); } catch { args = []; }
  } else if (element.dataset.actionArg != null) {
    const value = element.dataset.actionArg;
    args = [value === '1' || value === '-1' ? Number(value) : value];
  }
  if (element.dataset.actionValue === 'true') {
    let value = element.type === 'checkbox' ? element.checked : element.value;
    if (element.dataset.actionValueType === 'number') value = value === '' ? null : Number(value);
    if (element.dataset.actionValueType === 'float') value = value === '' ? null : parseFloat(value);
    args.push(value);
  }
  if (element.dataset.actionTarget === 'true') args.push(element);
  return args;
};
const dispatchAction = (target, event) => {
  const handler = comfyUiActions[target.dataset.action];
  if (typeof handler !== 'function') return;
  const args = actionArgs(target, event);
  handler(...args);
  if (target.classList.contains('pfield-bool-track')) target.classList.toggle('on', Boolean(args[1]));
};

// Form controls are driven by their own input / change events. Running the action
// on click as well re-renders the panel while a <select> is opening, which makes
// the dropdown flash and disappear.
const isValueControl = el => /^(SELECT|TEXTAREA)$/.test(el.tagName)
  || (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio|range|color|file)$/i.test(el.type));

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (event.target.closest('[data-stop-propagation]')) event.stopPropagation();
  if (!target) return;
  if (isValueControl(target)) return;
  dispatchAction(target, event);
});
document.addEventListener('input', event => {
  const target = event.target.closest('[data-action]');
  if (target) dispatchAction(target, event);
});
document.addEventListener('change', event => {
  const target = event.target.closest('[data-action]');
  if (target) dispatchAction(target, event);
});
document.addEventListener('mousedown', event => {
  const target = event.target.closest('[data-stop-propagation]');
  if (target) event.stopPropagation();
});
