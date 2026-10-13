(function (global) {
    'use strict';

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
            return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
        });
    }

    function render(markdown, options) {
        var emptyText = (options && options.emptyText) || '暂无内容';
        var source = String(markdown == null ? '' : markdown).trim();
        if (!source) return '<p class="md-empty">' + escapeHtml(emptyText) + '</p>';
        if (!global.marked || !global.DOMPurify) {
            return '<p>' + escapeHtml(source).replace(/\r?\n/g, '<br>') + '</p>';
        }
        // 原始 HTML 一律按字面文本显示，避免 <image1> 等占位符被 DOMPurify 当作未知标签丢弃。
        var parser = global.marked.Marked
            ? new global.marked.Marked({renderer: {html: function (token) { return escapeHtml(token.text != null ? token.text : token.raw); }}})
            : global.marked;
        var parsed = parser.parse(source, {
            async: false,
            breaks: true,
            gfm: true,
        });
        var clean = global.DOMPurify.sanitize(parsed, {
            USE_PROFILES: {html: true},
            ADD_ATTR: ['target'],
            FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'button'],
            FORBID_ATTR: ['style'],
        });
        var template = document.createElement('template');
        template.innerHTML = clean;
        template.content.querySelectorAll('a[href]').forEach(function (link) {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });
        template.content.querySelectorAll('img').forEach(function (image) {
            image.loading = 'lazy';
            image.referrerPolicy = 'no-referrer';
        });
        template.content.querySelectorAll('input').forEach(function (input) {
            if (input.type !== 'checkbox') { input.remove(); return; }
            input.disabled = true;
            input.removeAttribute('name');
            input.removeAttribute('value');
            input.removeAttribute('form');
        });
        return template.innerHTML;
    }

    global.MediaForgeMarkdown = {render: render, escapeHtml: escapeHtml};
})(window);
