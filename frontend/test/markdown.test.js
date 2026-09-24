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

  it('provides a safe empty state', () => {
    expect(renderMarkdown('', { emptyText: '<empty>' })).toBe('<p class="md-empty">&lt;empty&gt;</p>');
  });
});
