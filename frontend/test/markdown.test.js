import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, renderMarkdown } from '../src/shared/markdown.js';

vi.mock('dompurify', () => ({
  default: { sanitize: html => html.replace(/<script>[\s\S]*?<\/script>/gi, '') },
}));

vi.stubGlobal('document', {
  createElement: () => ({
    content: { querySelectorAll: () => [] },
    set innerHTML(value) { this._innerHTML = value; },
    get innerHTML() { return this._innerHTML; },
  }),
});

describe('shared markdown rendering', () => {
  it('escapes plain values used beside rendered markup', () => {
    expect(escapeHtml('<admin>')).toBe('&lt;admin&gt;');
  });

  it('renders Markdown while removing unsafe HTML and attributes', () => {
    const output = renderMarkdown('# Update\n\n**ready**\n\n<script>alert(1)</script>');

    expect(output).toContain('<h1>Update</h1>');
    expect(output).toContain('<strong>ready</strong>');
    expect(output).not.toContain('<script>');
  });

  it('keeps angle-bracket placeholders such as <image1> as literal text', () => {
    const output = renderMarkdown('请参考 <image1> 和 <image2> 生成');

    expect(output).toContain('&lt;image1&gt;');
    expect(output).toContain('&lt;image2&gt;');
    expect(output).not.toMatch(/<image\d/);
    expect(renderMarkdown('<image1>')).toContain('&lt;image1&gt;');
  });

  it('shows raw HTML tags as text instead of rendering them', () => {
    const output = renderMarkdown('hello <b onclick="x()">bold</b>');

    expect(output).not.toContain('<b');
    expect(output).toContain('&lt;b onclick=');
  });

  it('provides a safe empty state', () => {
    expect(renderMarkdown('', { emptyText: '<empty>' })).toBe('<p class="md-empty">&lt;empty&gt;</p>');
  });
});
