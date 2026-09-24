import * as rhWorkflowActions from 'virtual:rh-workflow-settings-features';
import 'virtual:mediaforge-theme';

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

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
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
document.addEventListener('mousedown', event => {
  const target = event.target.closest('[data-stop-propagation]');
  if (target) event.stopPropagation();
});
