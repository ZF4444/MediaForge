import * as rhWorkflowActions from 'virtual:rh-workflow-settings-features';
import 'virtual:mediaforge-theme';

// The embedding workflow-config page saves through this same-origin iframe
// boundary (iframe.contentWindow.saveRhWorkflowEditor / setRhWorkflowMedia).
// Module exports are not window properties, so expose them explicitly.
window.saveRhWorkflowEditor = rhWorkflowActions.saveRhWorkflowEditor;
window.setRhWorkflowMedia = rhWorkflowActions.setRhWorkflowMedia;

const argsFor = (target, value) => {
  let args = [];
  if (target.dataset.actionArgs) {
    try { args = JSON.parse(target.dataset.actionArgs); } catch { args = []; }
  } else if (target.dataset.actionArg != null) {
    const arg = target.dataset.actionArg;
    args = [arg === 'true' ? true : arg === 'false' ? false : /^-?\d+(?:\.\d+)?$/.test(arg) ? Number(arg) : arg];
  }
  if (target.dataset.actionValue === 'true') {
    let next = target.type === 'checkbox' ? target.checked : target.value;
    if (target.dataset.actionValueType === 'number') next = next === '' ? null : Number(next);
    if (target.dataset.actionValueType === 'float') next = next === '' ? null : parseFloat(next);
    args.push(next);
  } else if (value !== undefined && !target.dataset.actionArgs && target.dataset.actionArg == null) {
    args.push(value);
  }
  if (target.dataset.actionTarget === 'true') args.push(target);
  return args;
};

// Form controls (select / text / number / textarea / file) are driven by their own
// input / change events. A click on them must NOT run the action: opening a
// <select> would otherwise re-render the panel and destroy the dropdown mid-open.
const isValueControl = el => /^(SELECT|TEXTAREA)$/.test(el.tagName)
  || (el.tagName === 'INPUT' && !/^(button|submit|checkbox|radio)$/i.test(el.type));

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (isValueControl(target)) return;
  if (event.target.closest('[data-stop-propagation]')) event.stopPropagation();
  if (target.dataset.action === 'openRhWorkflowImport') {
    document.getElementById('rhWorkflowImportInput')?.click();
    return;
  }
  const handler = rhWorkflowActions[target.dataset.action];
  if (typeof handler === 'function') handler(...argsFor(target));
});
document.addEventListener('input', event => {
  const target = event.target.closest('[data-action]');
  const handler = target && rhWorkflowActions[target.dataset.action];
  if (typeof handler === 'function') handler(...argsFor(target, target.value));
});
document.addEventListener('change', event => {
  const target = event.target.closest('[data-action]');
  const handler = target && rhWorkflowActions[target.dataset.action];
  if (typeof handler === 'function') handler(target.files?.[0]);
});
// Rows and tabs are role=button/tab elements: activate them with Enter / Space.
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest?.('[role="button"][data-action]');
  if (!target || event.target !== target) return;
  event.preventDefault();
  const handler = rhWorkflowActions[target.dataset.action];
  if (typeof handler === 'function') handler(...argsFor(target));
});
document.addEventListener('mousedown', event => {
  const target = event.target.closest('[data-stop-propagation]');
  if (target) event.stopPropagation();
});
