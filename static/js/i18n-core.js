(function(){
    const dict = {};

    function normalizeEntry(key, entry){
        if(entry && typeof entry === 'object' && !Array.isArray(entry) && 'zh' in entry) return entry.zh == null ? key : String(entry.zh);
        return entry == null ? key : String(entry);
    }

    function register(bundle){
        if(!bundle || typeof bundle !== 'object') return;
        if(bundle.zh){
            Object.assign(dict, bundle.zh);
            return;
        }
        Object.entries(bundle).forEach(([key, entry]) => { dict[key] = normalizeEntry(key, entry); });
    }

    function t(key){
        return dict[key] || key;
    }

    function apply(root=document){
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.setAttribute('title', t(el.dataset.i18nTitle));
        });
        root.documentElement?.setAttribute('lang', 'zh-CN');
    }

    function entries(){
        return { zh: JSON.parse(JSON.stringify(dict)), en: {} };
    }

    window.StudioI18n = { t, apply, register, entries };
    document.addEventListener('DOMContentLoaded', () => apply());
})();
