import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('GPT chat entry dependencies', () => {
  it('uses the npm icon module instead of global vendor scripts', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/gpt-chat/main.js'), 'utf8');
    const html = readFileSync(resolve(process.cwd(), 'src/pages/gpt-chat/index.html'), 'utf8');
    const styles = readFileSync(resolve(process.cwd(), 'src/styles/gpt-chat.css'), 'utf8');

    expect(source).toContain('import { createIcons,');
    expect(source).toContain("from 'lucide';");
    expect(source).toContain('createIcons({ icons: chatIcons, root })');
    expect(source).toContain("import { applyTranslations, t } from './i18n.js';");
    expect(source).not.toContain('window.StudioI18n');
    expect(source).not.toContain('apiChannel.onmessage');
    expect(source).toContain("apiChannel.addEventListener('message'");
    expect(source).toContain("import { initializePageTheme } from '../shared/theme-runtime.js';");
    expect(html).not.toContain('tailwindcss-cdn.js');
    expect(html).not.toContain('<script src="/static/vendor/js/lucide.js"></script>');
    expect(html).toContain('../../gpt-chat/main.js');
    expect(html).toContain('/static/dist/styles/fonts.css');
    expect(html).not.toContain('/static/vendor/css/fonts.css');
    expect(html).not.toContain('/static/dist/shared/theme.js');
    expect(html).not.toContain('<style>');
    expect(html).toContain('/static/dist/styles/gpt-chat.css');
    expect(styles).toContain('.chat-shell');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onclick=');
    expect(html).not.toContain('oninput=');
    expect(html).not.toContain('onkeydown=');
    expect(html).not.toContain('onchange=');
  });
});
