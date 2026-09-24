import '@tailwindcss/browser';
import 'virtual:mediaforge-i18n';
import 'virtual:mediaforge-theme';
import * as comfyUiActions from 'virtual:comfyui-settings-features';

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

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (event.target.closest('[data-stop-propagation]')) event.stopPropagation();
  if (!target) return;
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
