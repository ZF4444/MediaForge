// Workflow settings feedback primitives: a promise-based confirmation dialog and
// toast notifications. They replace window.confirm / window.alert so the pages
// keep one visual language and never block the event loop.

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

let toastHost = null;

function ensureToastHost() {
  if (toastHost?.isConnected) return toastHost;
  toastHost = node('div', 'wf-toasts');
  toastHost.setAttribute('role', 'status');
  toastHost.setAttribute('aria-live', 'polite');
  document.body.append(toastHost);
  return toastHost;
}

/** Show a transient message. kind: 'info' | 'success' | 'error'. */
export function showToast(message, { kind = 'info', duration } = {}) {
  const host = ensureToastHost();
  const toast = node('div', `wf-toast wf-toast-${kind}`);
  toast.append(node('span', 'wf-toast-dot'), node('span', 'wf-toast-text', message));
  host.append(toast);
  // Errors stay a little longer so they can be read.
  const lifetime = duration ?? (kind === 'error' ? 5200 : 2600);
  const dismiss = () => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 220);
  };
  setTimeout(dismiss, lifetime);
  toast.addEventListener('click', dismiss);
  return dismiss;
}

/**
 * Open a modal confirmation. Resolves with 'confirm', 'extra' or 'cancel'.
 * `extraText` adds a third, secondary action (e.g. "不保存").
 * `tone: 'danger'` styles the confirm action destructively and focuses Cancel.
 */
export function confirmDialog({
  title,
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  extraText = '',
  tone = 'default',
} = {}) {
  return new Promise(resolve => {
    const dialog = node('dialog', 'wf-dialog');
    const titleId = `wf-dialog-title-${Math.random().toString(36).slice(2, 8)}`;
    dialog.setAttribute('aria-labelledby', titleId);

    const heading = node('h2', 'wf-dialog-title', title);
    heading.id = titleId;
    const actions = node('div', 'wf-dialog-actions');

    let result = 'cancel';
    const cancel = node('button', 'wf-btn wf-btn-ghost', cancelText);
    cancel.type = 'button';
    cancel.addEventListener('click', () => dialog.close());
    actions.append(cancel);

    if (extraText) {
      const extra = node('button', 'wf-btn wf-btn-ghost', extraText);
      extra.type = 'button';
      extra.addEventListener('click', () => { result = 'extra'; dialog.close(); });
      actions.append(extra);
    }

    const confirm = node('button', `wf-btn ${tone === 'danger' ? 'wf-btn-danger' : 'wf-btn-primary'}`, confirmText);
    confirm.type = 'button';
    confirm.addEventListener('click', () => { result = 'confirm'; dialog.close(); });
    actions.append(confirm);

    dialog.append(heading);
    if (message) dialog.append(node('p', 'wf-dialog-message', message));
    dialog.append(actions);

    // Clicking the backdrop (the dialog element itself) dismisses.
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });

    document.body.append(dialog);
    dialog.showModal();
    (tone === 'danger' ? cancel : confirm).focus();
  });
}
