// M22 拆分：核心画布状态变量。从 frontend/src/canvas/main.js 原样剪切，
// 声明的初始值一字不改，只做了纯粹的位置搬移。
//
// 为什么这里不用 ES module 的 export/import（跟 M1-M21 同一个原因，
// 但这里体现得最直接）：这 6 个变量在全部 19 个已拆分模块 + main.js
// 里加起来有 500+ 处读取/直接重新赋值（比如 `nodes = mergedNodes`、
// `selectedId = node.id`、`viewport.x = ...`），ES module 的具名 import
// 是只读绑定，直接重新赋值会在运行时报错（`Assignment to constant
// variable` 或类似错误），只有经典 <script> 的共享顶层脚本作用域才能
// 支持这种跨文件读写。state.js 保持经典脚本语法，通过
// <script src="state.js"> 排在 utils.js 之前、最先加载（比其它任何
// 模块都早，确保后续所有模块在自己的函数体内访问这些变量时——注意
// 不是在模块加载时立即访问，是在函数被调用时才访问——它们已经存在）。
//
// 本文件包含：
//   canvas —— 当前画布对象（从 /api/canvases/{id} 加载的完整数据，
//     包含 nodes/connections/viewport/settings/logs 等字段）。
//   nodes —— 当前画布的节点数组，是整个应用读写最频繁的状态。
//   selectedId —— 当前单选中的节点 id（空字符串表示无选中）。
//   selectedIds —— 当前多选中的节点 id 数组（框选/Ctrl多选场景）。
//   selectedImage —— 当前选中的图片在节点内的位置
//     {nodeId, index}（用于图片预览/候选池切换等场景）。
//   viewport —— 画布视口状态 {x, y, scale}，平移/缩放都会修改它。
//
// 依赖关系：本文件不依赖任何其它模块（不引用任何函数），是整个应用
// 里最先需要存在的状态，所有其它模块和 main.js 都通过共享脚本作用域
// 读取/重新赋值这些变量，用法跟拆分前完全一样（比如 `nodes.find(...)`/
// `nodes = mergedNodes`/`selectedId = ''`/`viewport.scale = ...`），
// 没有任何调用方需要改成 getter/setter 函数调用——这是本次拆分能够
// 安全完成的关键：物理搬移"声明的位置"，不改变"访问的方式"。
//
// 为什么这是安全的（这是本次拆分前专门验证过的一点，写在这里避免
// 后人重新踩一遍坑）：classic `<script>` 里用 `let`/`const` 声明的
// 顶层变量，虽然不会像 `var`/函数声明那样挂到 `window` 上，但仍然
// 处于所有 `<script>` 标签共享的顶层脚本作用域里——只要"访问"（读取
// 或重新赋值）发生在"声明所在的脚本执行完毕之后"，就能正常工作。
// 本文件排在最前面加载，声明语句是顶层立即执行的代码，会在浏览器
// 解析到 `<script src="state.js">` 时立刻执行完毕；而其它模块/
// main.js 里访问这些变量的代码全部在函数体内部，只有函数被调用时
// （必然晚于页面加载、晚于全部 <script> 执行完毕）才会真正访问，
// 所以加载顺序上不存在任何风险。这一点已经在 M16（`smartClientId`）/
// M19（`window.onmousemove` 依赖的15+个交互状态变量）等多个里程碑
// 里反复验证过。
let canvas = null;
let nodes = [];
let selectedId = '';
let selectedIds = [];
let selectedImage = {nodeId:'', index:-1};
let viewport = {x:0, y:0, scale:1};
