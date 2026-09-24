export function mountWorkflowCoverPicker({ root, input, removeButton, initialCover = {}, resolveUrl = cover => cover?.url || '', upload, onChange }) {
  if (!root || !input || !removeButton || typeof upload !== 'function' || typeof onChange !== 'function') {
    throw new TypeError('Workflow cover picker requires root, input, removeButton, upload, and onChange');
  }
  const label = root.querySelector('span');
  let cover = initialCover;
  let mounted = true;

  function render() {
    const url = resolveUrl(cover) || '';
    root.classList.toggle('has-cover', Boolean(url));
    root.style.backgroundImage = url ? `url("${url.replace(/"/g, '%22')}")` : '';
    if (label) label.textContent = url ? '更换封面' : '添加封面';
    removeButton.hidden = !url;
  }

  async function handleFileChange() {
    if (!mounted) return;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onChange({ error: new Error('请上传静态图片或 GIF 动图') });
      input.value = '';
      return;
    }
    root.classList.add('is-uploading');
    try {
      const nextCover = await upload(file);
      if (!mounted) return;
      cover = nextCover;
      render();
      onChange({ cover });
    } catch (error) {
      onChange({ error });
    } finally {
      root.classList.remove('is-uploading');
      input.value = '';
    }
  }

  const handleRemove = () => {
    if (!mounted) return;
    cover = {};
    render();
    onChange({ cover });
  };
  input.addEventListener('change', handleFileChange);
  removeButton.addEventListener('click', handleRemove);
  render();

  return {
    setCover(nextCover) {
      if (!mounted) return;
      cover = nextCover || {};
      render();
    },
    destroy() {
      if (!mounted) return;
      mounted = false;
      input.removeEventListener('change', handleFileChange);
      removeButton.removeEventListener('click', handleRemove);
    },
  };
}

export function mountActionDelegation(root, actions, { event = 'click' } = {}) {
  if (!root || !actions) return () => {};
  const handler = eventObject => {
    const target = eventObject.target.closest?.('[data-action]');
    if (!target || !root.contains(target)) return;
    const action = actions[target.dataset.action];
    if (typeof action !== 'function') return;
    const raw = target.dataset.actionArgs ?? target.dataset.actionArg;
    const args = raw == null ? [] : raw.split(',').map(value => {
      const item = value.trim();
      if (item === 'true') return true;
      if (item === 'false') return false;
      return /^-?\d+(?:\.\d+)?$/.test(item) ? Number(item) : item;
    });
    action(...args, eventObject);
  };
  root.addEventListener(event, handler);
  return () => root.removeEventListener(event, handler);
}
