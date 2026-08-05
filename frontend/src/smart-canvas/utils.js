// 从 static/js/smart-canvas.js 剪切出的无状态工具函数（M1 拆分批次）。
// 原文件位置：tr/trf/refreshIcons/uid/escapeHtml/escapeAttr 在 481-488 行，
// nowMs 单独在 6941 行。剪切时未改动任何函数签名/内部逻辑。
//
// 为什么这里不用 ES module 的 export/import：
//   smart-canvas.js 依赖经典 <script> 的全局作用域语义（顶层声明自动挂到
//   window），static/smart-canvas.html 里 57 处内联 onclick="xxx()" 都依赖
//   这一点。如果 utils.js 用 export，smart-canvas.js 里对应就要用 import，
//   而只要文件里出现一行 import，整个文件就必须以 <script type="module">
//   方式加载——这会让 smart-canvas.js 全部顶层声明失去 window 全局挂载，
//   直接破坏那 57 处内联事件绑定（这个风险在 M0 阶段已经验证过，见
//   frontend/README.md）。
//
//   所以这一步只做"物理文件拆分"：utils.js 依然是经典脚本，顶层 function
//   声明照样会挂到 window 上；只要保证 <script src="utils.js"> 排在
//   smart-canvas.js 之前加载，smart-canvas.js 里原来怎么调用 tr()/
//   escapeHtml() 等函数，现在还是怎么调用，不需要改一个字。等后续某个
//   真正的功能模块（而不是这几个无状态工具函数）被拆分、需要认真解决
//   全局作用域问题时，再一次性做整体 module 化 + window.xxx 导出的改造。
//
// 这些函数没有被 static/smart-canvas.html 的内联 onclick 引用，也没有被其他
// 独立的前端 JS 文件（canvas.js / asset-manager.js 等各自维护自己的
// escapeHtml 等同名函数，互不共享）跨文件引用。
//
// tr() 依赖 window.StudioI18n（由 /static/js/i18n.js 提供的外部全局对象），
// refreshIcons() 依赖 window.lucide（/static/vendor/js/lucide.js 提供），
// 两者都保留原样的 window.xxx 访问方式，不做改动。

function tr(key){ return window.StudioI18n?.t ? window.StudioI18n.t(key) : key; }

function trf(key, values={}){
    return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), tr(key));
}

function refreshIcons(){ if(window.lucide) lucide.createIcons(); }

function uid(prefix){ return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`; }

function escapeHtml(str){ return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }

const escapeAttr = escapeHtml;

function nowMs(){ return Date.now(); }
