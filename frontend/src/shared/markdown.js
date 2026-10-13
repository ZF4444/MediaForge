import { Marked } from 'marked';
import DOMPurify from 'dompurify';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

// 原始 HTML 一律按字面文本显示：模型回复里的 <image1> 等占位符否则会被 DOMPurify 当作未知标签丢弃。
const markdownParser = new Marked({
  renderer: { html: token => escapeHtml(token.text ?? token.raw ?? '') },
});

export function renderMarkdown(markdown, { emptyText = '暂无内容' } = {}) {
  const source = String(markdown ?? '').trim();
  if (!source) return `<p class="md-empty">${escapeHtml(emptyText)}</p>`;

  const parsed = markdownParser.parse(source, { async: false, breaks: true, gfm: true });
  const clean = DOMPurify.sanitize(parsed, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'button'],
    FORBID_ATTR: ['style'],
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  template.content.querySelectorAll('a[href]').forEach(link => {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  template.content.querySelectorAll('img').forEach(image => {
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
  });
  template.content.querySelectorAll('input').forEach(input => {
    if (input.type !== 'checkbox') { input.remove(); return; }
    input.disabled = true;
    input.removeAttribute('name');
    input.removeAttribute('value');
    input.removeAttribute('form');
  });
  return template.innerHTML;
}
