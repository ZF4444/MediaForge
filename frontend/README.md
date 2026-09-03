# frontend/

多个前端页面模块化重构的源码目录，对应 `docs/前端重构计划.md`。

**范围**：目前覆盖五个页面——`canvas`（画布，M1-M22，见下方
主体章节）、`api-settings`（API 设置页）、`asset-manager`（素材库管理
页）、`comfyui-settings`（ComfyUI 设置页）、`index`（应用外壳，见文末
对应章节）。**`frontend/src/canvas/main.js`（旧画布/无限画布）明确不在
范围内**——已确认未来会弃用，只需保证能打开旧画布，不值得投入模块化
重构的精力，保持现状手写单文件即可。`static/js/ltx-director-timeline.js`
（4111 行）也暂不纳入范围——这是一个 ComfyUI 自定义节点的前端 widget
脚本，代码结构是单个 3363 行的 `TimelineEditor` class（通过
`beforeRegisterNodeDef` 注册进 ComfyUI），跟其它几个页面"很多独立
顶层函数"的结构完全不同，拆分一个 class 的方法需要更谨慎的方案（比如
mixin 模式），风险收益比跟目前这几个页面不一样，值得单独评估。

五个页面共用同一套构建基础设施（`frontend/scripts/build-pages.mjs`，
一个脚本通过页面注册表驱动全部页面的构建），但各自的模块拆分是独立
进行的，互不依赖。

## 画布（canvas）

## 当前状态：M2（部分完成，同 M1 的范围原则）

M2 原计划是拆 `loop-node.js` + 建立布局快照测试。已完成，但沿用 M1 的
经典脚本方案（原因见下方），且严格排除了跟级联执行调度耦合的函数。

- **唯一源码分成三部分**：
  - `frontend/src/canvas/main.js`：主体代码，改动依然很频繁。
  - `frontend/src/canvas/utils.js`：M1 拆出的 7 个无状态工具函数。
  - `frontend/src/canvas/loop-node.js`：M2 拆出的循环节点
    （`smart-loop`）专属逻辑，约 30 个函数/常量，包括
    `smartLoopCount`/`smartLoopWidth`/`smartLoopHeight`/`fitSmartLoopNode`/
    `createLoopNode`/循环节点 UI 渲染与绑定（`smartLoopBodyHtml`/
    `bindLoopNodeControls`/`loopNumberControlHtml` 等）/循环提示词字段
    读写（`smartLoopPromptFieldValues` 等）/循环输入图片切片
    （`smartLoopInputImages`/`smartLoopTotalInputImages`/
    `smartLoopPreviewImages`）/循环链路克隆
    （`collectLoopChainSubgraph`/`cloneLoopChainForRound`）。
- **同样不是真正的 ES module**：原因跟 `utils.js` 完全一致——一旦用
  `export`/`import`，`canvas.js` 就要整体转 `type="module"`，
  破坏 57 处内联 `onclick`。另外 `loop-node.js` 里有对 `nodes`/`selectedId`
  的直接重新赋值（如 `createLoopNode` 里的 `selectedId = node.id`），
  这类赋值必须靠经典脚本共享全局作用域才能工作——ES module 具名 import
  是只读绑定，重新赋值会直接报运行时错误。所以 `loop-node.js` 同样是
  经典脚本，通过 `<script src="loop-node.js">` 排在 `utils.js` 之后、
  `main.js` 之前加载。
- **刻意排除的函数**（留在 `main.js`，属于其他模块的范畴）：
  - `outputImagesForNode`/`selfReferenceImagesForNode`/`textForNode`/
    `promptInputNodesFor`/`inputPromptTextFor`——处理
    `smart-prompt`/`smart-group`/`smart-loop` 三种节点类型的通用抽象
    函数，不是循环节点专属逻辑。
  - `runClonedLoopChain`/`showDirectLoopRoundPreview`/
    `directLoopRunTargets`/`isDirectLoopTargetRun`/
    `finishLoopTargetPreviewState`/`refsForDirectLoopRound`——深度耦合
    级联执行的 `runState`/`runPath` 调度逻辑，属于未来 `cascade-run.js`
    的范畴。
- **回归测试**：`frontend/test/loop-node.test.js`（用 Vitest），通过
  `frontend/test/loop-node-sandbox.js`（用 Node `vm` 模块模拟经典脚本的
  全局作用域，给 `nodes`/`render`/`nodeRect` 等依赖打最小化 mock）加载
  `utils.js` + `loop-node.js` 做纯逻辑测试。覆盖 `smartLoopCount` 的两种
  计算模式、节点尺寸计算、`smartLoopInputImages` 的批次切片逻辑，以及
  `cloneLoopChainForRound` 的布局快照测试（验证多轮克隆在 Y 轴上不重叠、
  链路内高节点会撑开行距、并行模式下按列排列不重叠、克隆节点会清空运行
  痕迹字段）——对应本次会话之前修复过的"循环节点 Y 轴重叠"一类问题，
  转成了永久回归测试。

## 当前状态：M3（完成，同 M1/M2 的范围原则）

M3 拆了 `node-layout.js`（节点布局计算）和 `node-model.js`（节点数据模型），
同样沿用经典脚本方案。

- **唯一源码分成五部分**：
  - `frontend/src/canvas/main.js`：主体代码，改动依然很频繁。
  - `frontend/src/canvas/utils.js`（M1）：7 个无状态工具函数。
  - `frontend/src/canvas/loop-node.js`（M2）：循环节点专属逻辑。
  - `frontend/src/canvas/node-layout.js`（M3）：节点布局计算，
    包括 `safeScale`/`nodeScale`/`mediaNodeDefaultScale`/
    `smartGroupLayoutSize`/`smartGroupThumbLayout`/`singleImageLayout`/
    `groupImageGridLayout`/`smartNodeInputThumbRows`/
    `smartNodeInputThumbsHeight`/`smartNodeInputThumbsHtml`/
    `promptNodeLayoutSize`/`imageLayout`/`nodeRect`。
  - `frontend/src/canvas/node-model.js`（M3）：节点数据模型的
    创建/克隆/规范化，包括 `normalizeLegacySmartNode`/
    `createImageNodeAt`/`inheritNodeMetaFromImage`/`createNode`/
    `createPromptNode`/`createSmartGroupNode`/`cloneSmartNode`。
- **同样不是真正的 ES module**：原因跟 `utils.js`/`loop-node.js` 完全
  一致。`node-model.js` 里同样有对 `nodes`/`selectedId` 的直接重新赋值
  （如 `createNode` 里的 `selectedId = node.id`）。加载顺序：
  `utils.js` → `loop-node.js` → `node-layout.js` → `node-model.js` →
  `main.js`（`node-model.js` 的 `createImageNodeAt` 依赖
  `node-layout.js` 的 `imageLayout`）。
- **刻意排除的函数**（留在 `main.js`）：
  - `arrangeSmartGroupMembers`——会调用 `pushUndo()` 并直接修改节点
    `x/y/w/h` 的"排列命令"，不是纯布局计算，且依赖分组成员查询。
  - `createGenerationNodeByKind`——调用 `updateComposer()`，是"创建节点 +
    同步 composer UI 状态"的组合操作，超出纯节点数据模型范畴。
  - `applyNodeMetaToImage`——只是 `stripImageGenerationMeta` 的单行
    包装，使用点单一。
  - 候选池管理相关（`migrateGeneratedImagesToCandidatePool`/
    `mergeCandidateImages`/`setNodeMainCandidate` 等）——体量较大且相对
    独立的子系统，`node-model.js` 里的函数会调用它们（作为全局），
    但本次不拆。
- **回归测试**：`frontend/test/node-layout.test.js`，用同样的 `vm` 模块
  沙箱方案（`node-layout-sandbox.js`）覆盖 `safeScale`/`nodeScale`/
  `mediaNodeDefaultScale`/`singleImageLayout`/`groupImageGridLayout`/
  `smartNodeInputThumbRows`/`smartNodeInputThumbsHeight`/
  `promptNodeLayoutSize`/`imageLayout`/`nodeRect`，共 21 个测试。

## 当前状态：M4（完成，同 M1/M2/M3 的范围原则）

M4 拆了 `connections.js`（连线数据与渲染），同样沿用经典脚本方案。

- **唯一源码分成六部分**：
  - `frontend/src/canvas/main.js`：主体代码，改动依然很频繁。
  - `frontend/src/canvas/utils.js`（M1）。
  - `frontend/src/canvas/loop-node.js`（M2）。
  - `frontend/src/canvas/node-layout.js` + `node-model.js`（M3）。
  - `frontend/src/canvas/connections.js`（M4）：连线数据操作
    （`addConnection`/`connectInputNode`/`disconnectConnection`/
    `outgoingConnectionsFor`/`outgoingInputConnectionsFor`/
    `connectionMidpoint`/`insertionConnectionForNode`）+ 连线渲染与端口
    拖拽交互（`connectionGeometry`/`renderConnections`/
    `updateConnectionGeometryInPlace`/`refreshConnectionLayer`/
    `requestRefreshConnectionLayer`/`bindConnectionEvents`/
    `ensurePortDragPathElement`/`clearPortDragVisual`/
    `updatePortDragVisual`/`handlePortDrop`/`openPortDropMenu`/
    `closePortDropMenu`/`drawPortDropMenuLine`/`handlePortDropMenuSelect`）。
- **同样不是真正的 ES module**：原因跟前三轮完全一致。加载顺序：
  `utils.js` → `loop-node.js` → `node-layout.js` → `node-model.js` →
  `connections.js` → `main.js`。
- **顺带迁移的模块局部状态**：`portDropMenuDrag`/`portDropMenuScreenPoint`
  这两个 `let` 声明原来就紧邻 `openPortDropMenu` 等函数、只在这个连线菜单
  功能内部使用，随函数一起搬到了 `connections.js`（这两个不属于会被其它
  模块共享的"全局状态"，跟 `portDragState`/`loopInsertPreview` 那种真正
  跨模块共享的状态不同——后两者还留在 `main.js`，因为 `bindNodeEvents`
  等 canvas-render.js 范畴的代码也会读写它们）。
- **刻意排除的函数**（留在 `main.js`）：
  - `cascadeConnectionKeys`/`smartCascadeEdgeState`——级联调度范畴，
    `renderConnections` 会调用它们判断连线是否处于级联执行状态，属于
    未来 `cascade-run.js` 的范畴。
  - `createGenerationNodeByKind`——M3 阶段就已排除在 `node-model.js`
    之外（耦合 composer UI 状态），`handlePortDropMenuSelect` 里仍然
    调用它作为全局。
- **回归测试**：`frontend/test/connections.test.js`（22个测试），覆盖
  `addConnection` 的去重/自环校验、`connectInputNode` 对 `smart-loop`
  目标节点的 `imageInput`/`showPrompt` 自动识别、`outgoingConnectionsFor`
  的 kind 过滤、`connectionMidpoint`/`connectionGeometry` 的 flow vs
  history 几何计算差异、`insertionConnectionForNode` 的最近连线查找。
  测试过程中发现两次自己的测试断言用了对称坐标/相同节点尺寸，导致
  flow 和 history 两条公式代数上刚好算出相同结果——不是生产代码的
  bug，是测试用例本身的坐标/尺寸没选对，后改用不同尺寸的节点验证。

## 当前状态：M5（完成，同 M1-M4 的范围原则）

M5 拆了 `cascade-run.js`（一键运行/级联生成调度），是体量最大、调用链
最深的模块。采用了比 M1-M4 更谨慎的分批策略：先拆最小风险的独立小函数，
再拆中等复杂度的 provider 调用函数，最后才处理核心编排函数，每一批都
单独验证，不一次性全部完成。

- **唯一源码分成七部分**：
  - `frontend/src/canvas/main.js`：主体代码，改动依然很频繁。
  - `frontend/src/canvas/{utils,loop-node,node-layout,node-model,connections}.js`
    （M1-M4）。
  - `frontend/src/canvas/cascade-run.js`（M5）：共 32 个函数，
    分三批拆出：
    - **第1批**（最小风险的独立小函数）：`smartCascadeAbortError`/
      `throwIfSmartCascadeStopRequested`/`requestSmartCascadeStop`/
      `smartCascadeParallelLimit`/`runSmartCascadeRoundsWithLimit`。
    - **第2批**（中等复杂度的 provider 调用函数）：ComfyUI 队列基础设施
      （`createSmartComfyTask`/`waitSmartComfyTaskResult`/
      `runQueuedSmartComfyGenerate`/`comfyParamsFromWorkflowValues`）、
      ComfyUI 具体调用（`comfyFieldKind`/`runComfyGeneration`/
      `runComfyText`/`runComfyEnhance`/`runComfyEdit`/`comfyNameForRef`/
      `sleep`）、其它 provider 调用（`runApiGeneration`/
      `submitRunningHubGeneration`/`pollRunningHubTask`/
      `runRunningHubGeneration`/`runApiVideoGeneration`/
      上分成两段（中间隔着第3批的核心编排函数），搬到新文件后重新拼接
      为连续代码块。
    - **第3批**（核心编排函数，体量最大、嵌套最深）：
      `runCascadeStepIntoNode`/`runLoopRoundIntoSlot`/`runClonedLoopChain`/
      `appendCascadeRefsToReceiver`/`cascadeRefsFromOutputs`/
      `smartCascadeStopText`/`runSmartCascade`/`runSmartCascadeFromLoop`/
      `runGeneration`。这批密集读写 `settings`/`selectedId`/
      `selectedIds`/`selectedImage`/`smartLoopContext`/
      `smartCascadeRunPath` 等全局状态（跟前面几轮同一个经典脚本共享
      全局作用域模式），单独逐行核对了字节级一致性。
- **同样不是真正的 ES module**：原因跟前四轮完全一致。加载顺序：
  `utils.js` → `loop-node.js` → `node-layout.js` → `node-model.js` →
  `connections.js` → `cascade-run.js` → `main.js`。
- **验证过程中的插曲**：第3批做字节级 diff 校验时，因为手工计算行号
  范围（`sed -n 'N,Mp'`/Python 切片）连续算错了两次边界（`runGeneration`
  的真实结束行数比预期多算了 1-2 行），一度误判为"内容缺失"。最终改用
  直接 `sed -n 'Np'` 打印单行确认真实边界后，验证通过——这纯粹是校验
  脚本本身的行号计算失误，被搬移的实际代码内容从一开始就是正确的
  （`node --check` 全程通过），但过程提醒了在处理这种体量的批次时，
  校验脚本本身也需要格外仔细核对，不能想当然。
- **回归测试**：`frontend/test/cascade-run.test.js`（22个测试），只覆盖
  第1批的纯逻辑函数（`smartCascadeAbortError`/
  `throwIfSmartCascadeStopRequested`/`requestSmartCascadeStop`/
  `smartCascadeParallelLimit`/`runSmartCascadeRoundsWithLimit`/
  `cascadeRefsFromOutputs`/`smartCascadeStopText`）。`runSmartCascade`/
  `runGeneration` 等核心编排函数深度依赖 DOM 和网络请求，不适合单元
  测试模拟，主要依赖字节级 diff 校验 + 人工浏览器回归覆盖。

## 当前状态：M6（完成，同 M1-M5 的范围原则）

M6 拆了 `upload.js`（上传/拖拽/配额弹窗），共 28 个函数。

- **唯一源码分成八部分**：
  - `frontend/src/canvas/main.js`：主体代码，改动依然很频繁。
  - `frontend/src/canvas/{utils,loop-node,node-layout,node-model,connections,cascade-run}.js`
    （M1-M5）。
  - `frontend/src/canvas/upload.js`（M6）：拖拽数据解析
    （`dataTransferItemEntry`/`filesFromEntry`/`smartDropDataTypes`/
    `smartImageDropPayload`/`resolveSmartImageDropPayload`/
    `hasSmartImageDropData`/`hasSmartAssetDrag` 等）+ 文件上传
    （`isSupportedUploadFile`/`uploadTitleForItems`/`uploadFiles`/
    `appendImagesToSmartNode`/`handleFiles`/`importSmartLocalImages`/
    `handleSmartImageDropPayload`）。
- **同样不是真正的 ES module**：原因跟前五轮完全一致。加载顺序：
  `utils.js` → `loop-node.js` → `node-layout.js` → `node-model.js` →
  `connections.js` → `cascade-run.js` → `upload.js` → `main.js`。
- **刻意排除的函数**（留在 `main.js`）：`StorageQuotaSignal`/
  `quotaDataFromPayload`/`checkQuotaWarningFromResult`/
  `smartResponseError`/`smartResponseErrorMessage`——这几个函数原来
  物理上紧邻这批上传函数中间，但 `checkQuotaWarningFromResult` 和
  `StorageQuotaSignal` 实际被 M5 的 `cascade-run.js` 大量调用（比如
  `waitSmartComfyTaskResult`/`runLoopRoundIntoSlot`），是通用的"生成
  结果配额检查/网络请求错误处理"基础设施，不是上传功能专属的东西——
  跟 M3 阶段"`createGenerationNodeByKind` 留在 main.js"是同一个判断
  原则：按实际调用关系归属，而不是按物理位置或名字表面含义。
- **验证过程中的插曲**：这轮在做字节级 diff 校验时，一开始沿用 M5 的
  经验用 `sed -n 'N,Mp'` 计算范围，结果发现自己对哪一行是"某个函数的
  最后一行"又理解错了一次（`smartImageFilesFromDataTransfer` 的真实
  结束行、`smartResponseErrorMessage` 的真实结束行都跟最初设想的差
  1 行）。这次直接先用 `grep -n "^}"` 配合行号范围筛选，一次性拿到
  所有顶层函数的真实结束行号，再做切割，避免了 M5 那种来回试错。
  另外发现 `frontend/src/canvas/upload.js` 里 `hasSmartAssetDrag`
  一开始被我误写成了跟源文件不一致的格式（多余的换行被我"修正"掉了，
  但源文件本身就是不规范的单行格式），字节级 diff 揪出了这个问题，
  照抄源文件原样改回。
- **回归测试**：`frontend/test/upload.test.js`（23个测试），覆盖
  `isSupportedUploadFile` 的 MIME/后缀双重判断、`uploadTitleForItems`
  的媒体类型组合标题生成、拖拽数据解析（`smartDropDataTypes`/
  `readSmartDropData`/`decodeSmartDropText`）、远程 URL vs 本地路径的
  判定、`smartImageDropPayload` 按"文件 > 本地路径 > 远程 URL"优先级
  归纳拖拽类型、内部拖拽来源识别、`appendImagesToSmartNode` 的分组
  节点合并/新建节点两条路径。全部一次性通过。

## 当前状态：M8（完成）+ prompt-node/composer 拆分暂缓（重要发现，见下）

M7 拆了 `canvas-render.js`（主渲染循环 + 节点事件绑定），共 18 个函数，
是目前耦合度最高的一批。

- **唯一源码分成九部分**：新增
  `frontend/src/canvas/canvas-render.js`（M7），排在 `upload.js`
  之后、`main.js` 之前加载。包含两类函数：
    `smartRecoverableImageTask`/`imageTaskRecoverBodyHtml`/`nodeBodyHtml`。
  - 主渲染循环与节点事件绑定：`formatRunDuration`/`nodeRunElapsedMs`/
    `runTimePillHtml`/`hideRunTimerForNode`/`refreshRunTimerPills`/
    `render`/`measureSmartNodeImages`/`pickMediaForSmartNode`/
    `bindNodeEvents`/`rectOverlapNode`/`dragConnectTargetFor`/
    `canAutoConnectDraggedNode`/`restoreDraggedNodePosition`。
  - 这批函数物理上不连续，中间被 `bindPromptNodeControls`/
    `bindScrollableText` 隔开，拆分时按"实际调用关系"分成两段分别切
    出、拼接进同一个新文件（拼接顺序跟原文件一致：先节点 HTML 构建
    段，再主渲染/事件绑定段）。
- **刻意排除的函数**（留在 `main.js`）：
  - `bindPromptNodeControls`/`bindScrollableText`：物理上紧邻
    `measureSmartNodeImages`/`pickMediaForSmartNode` 之间，但只服务于
    `smart-prompt` 节点的富文本框交互（`bindScrollableText` 只被
    `bindPromptNodeControls` 调用一次），属于计划里未来 `prompt-node.js`
    模块的范围，本次不动。
  - `window.onmousemove`/`window.onmouseup`：整个应用里最大的一对匿名
    事件处理器（各约 190 行/120 行），是拖拽/平移/选框/预览对比/全景图
    /裁剪框/缩略图拖拽/端口连线拖拽等十多种互斥交互状态的总调度中心，
    内部会回调 `dragConnectTargetFor`/`restoreDraggedNodePosition`/
    `rectOverlapNode` 等本次已迁移的小函数（这也是为什么这几个小函数
    被一并挪进 `canvas-render.js`：它们既被 `bindNodeEvents` 用到，也
    被这对全局处理器用到）。但处理器本体横跨图片编辑器/资产库/连线等
    多个尚未拆分或已拆分到别的模块的状态，且是 `window.xxx = fn` 赋值
    形式（不是具名函数声明，`get_document_symbols` 扫描不到），提前
    搬动会让"渲染核心"模块过早耦合进图片编辑器/资产库的边界。留在
    `main.js`，作为后续里程碑（`image-editor.js`/`asset-library.js`
    定型后）再评估是否需要专门拆一个"输入事件分发"模块来装它。
  - `deleteNode`/`clearNodeMediaBeforeDelete`/`deleteNodeFromButton`：
    物理上紧邻 `restoreDraggedNodePosition` 之后，但属于节点生命周期
    管理（删除节点及其历史组、清空节点媒体），跟渲染/事件绑定核心是
    两类关注点，本次不动。
- **本次发现的架构事实**：`get_document_symbols`（基于具名函数声明的
  AST 扫描）看不到 `window.onmousemove = e => {...}` 这种赋值形式的
  事件处理器。这提醒了一点：后续继续拆分时，不能只依赖符号扫描结果
  判断"还剩什么没拆"，还要用 `grep -n "^\(window\|document\)\."` 之类
  的搜索确认有没有匿名的全局事件绑定藏在别处。
- **回归测试**：`frontend/test/canvas-render.test.js`（18个测试），
  只覆盖运行计时相关的纯函数（`formatRunDuration`/`nodeRunElapsedMs`/
  `runTimePillHtml`/`hideRunTimerForNode`）和 `smartRecoverableImageTask`
  的任务筛选逻辑。`render`/`bindNodeEvents`/`measureSmartNodeImages`
  等核心函数跟 M5 核心批次一样强依赖真实 DOM，不适合单元测试模拟，
  主要依赖字节级 diff 校验 + 跨文件全局作用域模拟 + 后续人工浏览器
  回归覆盖。

### prompt-node.js / composer / 模板系统拆分：调研后决定暂缓

M8 开始前按计划调研 `prompt-node.js` 的拆分范围，发现计划里"每个功能一个
模块"的假设在这里不成立：

- `smart-prompt` 节点自身的逻辑很薄，只有 `promptNodeBodyHtml`/
  `bindPromptNodeControls`/`bindScrollableText`（约150行）。
- 真正体量庞大的"提示词模板库/预设/composer 底部输入栏/@提及图片"整套
  系统（`promptTemplateItems`/`renderPromptTemplatePanel`/
  `updateComposer`/`buildPromptRequest`/`renderMentionPicker` 等上百个
  函数），实际上是**图片节点生成 composer** 的基础设施，只是顺带也给
  `smart-prompt` 节点提供模板填充功能——`applyPromptTemplateToNode`
  内部按 `target === 'composer'` 还是 `'node'` 分两条路径就是证据。
  也就是说它不是"prompt-node 专属"，硬拆成 `prompt-node.js` 会产生
  一个名不副实、且把 composer 基础设施强行塞进去的模块。
- 更关键的是，这整套系统与一段约1400行（11869-13287行）的**顶层匿名
  事件绑定代码**深度耦合——canvas 平移/缩放预览/右键菜单/节点拖拽（即
  M7 发现的 `window.onmousemove`/`onmouseup`）/拖放/粘贴/键盘快捷键/
  模板与预设面板的点击绑定/应用启动序列，全部写在同一段顶层脚本里，
  不在任何具名函数内部。这比 M7 发现的问题规模更大：M7 只需要留下
  一对事件处理器不动，这里则是整个应用的"启动与全局交互总线"。
- **决定**：暂缓整个 prompt-node/composer/模板系统的拆分，标记为需要
  专门更大风险预算的独立里程碑（可能需要先把这段顶层脚本本身重新组织
  成具名函数，才能安全地按功能切分），不在本次会话继续推进。

## 当前状态：M8（完成，同 M1-M7 的范围原则）

调研 prompt-node.js 未果后，转向确认更清晰、耦合度较低的目标——
图片编辑器（`#imageEditModal` 弹窗的全部功能），确认其中没有顶层匿名
事件绑定，函数命名规整，是更接近 M1-M7 风格的传统模块。

M8 拆了 `image-editor.js`，共约90个函数，是目前拆出的最大单个模块
（约2440行源码）。

- **唯一源码分成十部分**：新增
  `frontend/src/canvas/image-editor.js`（M8），排在
  `canvas-render.js` 之后、`main.js` 之前加载。覆盖：
  - 编辑源图片读取：`currentEditImage`/`previewSourceImages`/
    `cropImageDisplaySize`/`cropBounds` 等。
  - 裁剪：`clampCrop`/`resetCropBox`/`renderCropBox`/`applyImageCrop`。
  - 智能扩图（outpaint）：`clampOutpaint`/`applyImageOutpaint`/
    `chainOutpaintGenerationNode`。
  - 蒙版/画笔：`applyImageMask`/`applyImageBrush`/画笔撤销重做历史。
  - 网格拼接/拆分：`gridSplitRects(Custom)`/`ensureGridJoinLayout`/
    `applyImageGridJoin`/`applyImageGridSplit`。
  - 文字工具：`beginEditText`/`renderEditTextCanvas`/内联文字编辑器。
  - 全景图预览：`ensurePanoramaRenderer`/`loadPanoramaTexture`/
    `drawPanoramaFrame` 等（依赖运行时动态 `import()` 加载 three.js，
    不是静态 import 声明，物理搬移不受影响，见下方说明）。
  - 视频帧导出/预览对比面板：`exportVideoFrame`/`refreshComparePanel`。
  - 弹窗生命周期：`openImageEditor`/`closeImageEditor`/`openImagePreview`/
    `applyImageEdit`（编辑模式分发入口）。
- **three.js 依赖说明**：`ensurePanoramaRenderer` 用的是运行时动态
  `import('/static/vendor/js/three-0.160.0.module.js?...')`，不是文件
  顶部的静态 `import` 声明。动态 `import()` 表达式在经典 `<script>`
  里同样可用（这是浏览器运行时特性，不要求宿主脚本本身是 ES module），
  物理搬移到 `image-editor.js` 后无需任何改动，构建脚本也不需要特殊
  处理这个依赖。
- **刻意排除的函数**（留在 `main.js`）：`currentComposerSubject` 及其
  后的 composer/提示词模板/@提及系统——物理上紧邻 `applyImageEdit` 之
  后，但属于图片节点生成 composer 的基础设施，不是图片编辑器本身，
  已在上面"prompt-node.js 拆分暂缓"一节详细说明原因。
- **确认不排除的函数**：`uploadCroppedBlob`/`uploadImageBlobs` 保留在
  本文件内——虽然名字听起来像 `upload.js`（M6）的通用上传功能，但 grep
  验证后发现它们只被本文件内的 `applyImageCrop`/`applyImageOutpaint`/
  `applyImageMask`/`applyImageBrush`/`applyImageGridSplit`/
  `applyImageGridJoin` 六个函数调用，是图片编辑器编辑结果上传的专属
  封装（提交裁剪后的 blob），不是通用文件上传基础设施，符合"按实际
  调用关系归属"的一贯原则。
- **回归测试**：`frontend/test/image-editor.test.js`（16个测试），覆盖
  `gridJoinAutoDims` 的行列数自动计算、`gridSplitRects`/
  `gridSplitRectsCustom` 的矩形区域计算（标准等分网格 + 自定义分割线
  两种模式，含去重逻辑）、`clampCrop`/`clampOutpaint` 的裁剪框钳制逻辑
  （尺寸/位置钳制，以及 outpaint 模式下裁剪框可以比图片大的相反方向
  钳制）。`openImageEditor`/`closeImageEditor`/`renderCropBox`/
  `applyImage*` 等核心函数跟 M5/M7 核心批次一样强依赖真实 DOM 与
  three.js 动态加载，不适合单元测试模拟。

## 当前状态：M9（完成，同 M1-M8 的范围原则）

调研发现资产库面板（`#assetPanel`）比图片编辑器更分散——物理上分成四段
非连续区间，中间被节点右键菜单/节点快捷键栏/canvas 多人协作合并同步等
无关代码隔开，跟 M6 发现的 `StorageQuotaSignal` 物理插入模式类似，但
这次是四段而不是一段。

M9 拆了 `asset-library.js`，共26个函数。

- **唯一源码分成十一部分**：新增
  `frontend/src/canvas/asset-library.js`（M9），排在
  `image-editor.js` 之后、`main.js` 之前加载。覆盖：
  1. 资产库/分类数据访问：`assetCategories`/`assetLibraries`/
     `activeAssetLibrary`/`activeAssetCategory`/`assetCategoriesForLibrary`。
  2. "保存到资产库"弹窗：`renderNodeAssetSaveModal`/
     `closeNodeAssetSaveModal`/`openNodeAssetSaveModal`/
     `selectedAssetSaveItems`/`openSelectionAssetSaveModal`/
     `saveFileToAssetLibrarySelection`。
  3. 资产库加载：`loadAssetLibrary`。
  4. 资产库渲染/交互/远程同步响应：`setAssetLibraryFromResponse`/
     `toggleAssetLibrary`/`assetCategoryForMention`/`assetMediaKind`/
     `assetThumbHtml`/`renderAssetLibrary`/`openAssetNameDialog`/
     `positionAssetHoverPreview`/`showAssetHoverPreview`/
     `hideAssetHoverPreview`/`beginAssetInlineRename`/`bindAssetItemEvents`/
     `addFileToAssetLibrary`/`canvasImageDragPayload`。
  - 以上四段物理上互不相邻，拆分时按"实际调用关系"分四段分别切出，
    拼接进同一个新文件（拼接顺序跟原文件一致）。
- **刻意排除的函数**（留在 `main.js`）：
  - `nodeShortcutTargetFor`/`triggerNodeShortcutAction`/
    `bindNodeContextMenuEvents`/`triggerNodeContextAction` 等：物理上
    紧邻"保存到资产库"弹窗前后，但是节点右键菜单/快捷键栏的通用调度
    函数，只是其中一个分支会调用 `openNodeAssetSaveModal`，本身横跨
    下载/取消分组/全屏预览/图片编辑器等一堆跟资产库无关的动作。
  - `connectAssetLibrarySyncSocket`：名字像资产库同步，但实际是
    canvas 多人协作用的**唯一** WebSocket 连接，`onmessage` 里
    同时分发 `asset_library_updated`（资产库同步，调用本文件的
    `handleAssetLibraryUpdatedMessage`）和 `canvas_updated`（canvas
    文档多人合并同步，调用 `main.js` 里的 `handleCanvasUpdatedMessage`）
    两类消息，是共享基础设施，不能整体搬进 `asset-library.js`。
  - `handleCanvasUpdatedMessage`/`startCanvasMetaPoll`/
    `scheduleCanvasMergeReload`/`mergeReloadCanvasNow`/
    `applyMergedServerCanvas`/`mergeSmartConnections`/
    `mergeSmartNodeLists`/`mergeSmartNode`/`smartNodeInFlight`/
    `mergeSmartImageLists`：物理上夹在 `loadAssetLibrary` 和
    `setAssetLibraryFromResponse` 之间，但是 canvas 文档本身的多人
    协作合并逻辑（节点/连线的本地-远程合并策略），跟资产库是完全
    不同的两个子系统，只是碰巧物理上写在了一起。
  - `smartClientId`（模块级常量，多人协作用的客户端 id）：被
    `connectAssetLibrarySyncSocket`/`saveCanvas`/`cascade-run.js` 的
    `runQueuedSmartComfyGenerate` 等多处引用，是跨文件共享的全局
    状态，物理上紧邻 `loadAssetLibrary` 之后声明，留在 `main.js`。
- **回归测试**：`frontend/test/asset-library.test.js`（18个测试），
  覆盖 `assetLibraries`/`activeAssetLibrary` 的资产库选取与回退逻辑、
  `assetCategories`/`activeAssetCategory`/`assetCategoriesForLibrary`
  的分类过滤与选取逻辑、`assetMediaKind` 按 kind/type 字段或 URL/
  文件名后缀判定 image/video/audio 三种媒体类型、`canvasImageDragPayload`
  从节点图片构建拖拽 payload（含缺省字段兜底与自动媒体类型判定）。
  `renderAssetLibrary`/`bindAssetItemEvents`/`beginAssetInlineRename`/
  `openNodeAssetSaveModal` 等函数强依赖真实 DOM 和网络请求，跟
  M5/M7/M8 核心批次一样不适合单元测试。

## 当前状态：M10（完成，同 M1-M9 的范围原则）

M9 之后重新评估剩余候选，发现"生成参数设置面板"（底部 composer 里
不同引擎/模型对应的尺寸/比例/数量等参数 UI）是物理上连续的一整块
（约1600行），不像 M9 的资产库那样碎片化，也不像 prompt-node/composer
那样跟顶层匿名事件绑定深度耦合——它只是被少数几个简单的函数调用
（引擎下拉 onchange、应用启动序列里的 `loadConfig()`）触发，跟 M7 的
`render()`、M9 的 `renderAssetLibrary()` 被外部事件处理器调用是同一种
安全模式，风险明显低于 prompt-node/composer。

M10 拆了 `generation-settings.js`，共135个函数。

- **唯一源码分成十二部分**：新增
  `frontend/src/canvas/generation-settings.js`（M10），排在
  `asset-library.js` 之后、`main.js` 之前加载。物理上是连续的一整块
  （原文件 1753-3365 行区间），覆盖：
  1. 引擎/模型可用性判断：`syncEngineOptionsVisibility`/
     `smartModelAllowed`/
     `providerHasAllowedImageModel`/`imageProviders`/`volcengineProvider`/
     `runningHubProvider` 等。
  2. RunningHub 工作流字段解析与渲染：`rhFieldKind`/`rhFieldRole`/
     `rhExtractFieldOptions`/`rhDefaultValue`/`rhParamValue`/
     `renderRhSettingField`/`renderRhConfigControl` 等。
     等。
  4. 通用参数控件渲染：`renderProviderControl`/`renderModelControl`/
     `renderSizeControls`/`renderRatioControl`/`renderResolutionControl`/
     `renderQualityControl`/`renderCountVisualControl` 等。
  5. 各引擎专属参数面板：`renderApiParams`/`renderApiVideoParams`/
     `renderVolcengineParams`/`renderMsParams`/`renderRunningHubParams`/
     `renderComfyParams`/`renderVideoGenerationConfig` 等。
  6. 参数面板总入口与事件绑定：`renderDynamicParams`（按当前
     engine/apiKind 分发到对应渲染函数）/`bindDynamicParams`（给面板
     所有交互控件绑定 onclick/oninput）/`setDynamicSetting`。
  7. 全局配置加载：`loadConfig`/`refreshSmartConfigFromSettings`。
- **风险判断依据**：这批函数高度自洽（都读写同一个 `settings` 全局
  对象，互相调用频繁），只通过 `renderDynamicParams`/
  `updateProviderModels` 等少数几个入口被外部调用（节点选中变化、
  引擎下拉切换 `engineSelect.onchange`、应用启动序列 `window.onload`
  里的 `loadConfig()`），且都是简单的函数调用形式——不同于 M7 发现的
  `window.onmousemove`/`onmouseup`（函数体本身写在事件处理器闭包里，
  涉及十几个互斥状态分支）或 prompt-node/composer（跟 1400 行顶层
  匿名脚本的控制流直接交织），这里外部只是"调用了一个具名函数"，跟
  M9 的 `renderAssetLibrary()`、M7 的 `render()` 被外部事件处理器
  调用是同一种已验证安全的模式。
- **刻意排除的函数**（留在 `main.js`）：`toggleZoomPreview` 及其前后
  的缩放预览函数（物理上紧邻本文件开头，但是画布缩放预览功能，跟
  生成参数设置无关）；`loadPromptPresets` 及其后的提示词模板/预设
  系统（物理上紧邻本文件结尾，属于已确认暂缓拆分的 prompt-node/
  composer 范围）。
- **回归测试**：`frontend/test/generation-settings.test.js`（26个
  测试），覆盖 `gcdInt`/`imageSizeForRatio`/`reducedRatioForImage`
  的图片宽高比化简计算、`closestStandardRatioKey` 按宽高比匹配标准
  比例档位、`parseRatioValue`/`parseSizeValue` 解析用户输入的比例/
  尺寸字符串、`ratioIconClass`/`videoAspectIconClass` 的图标 class
  映射、`ratioLabel` 的比例展示文案（含 prefix 参数与自定义比例）、
  `msModelLabel` 的模型名称映射。`renderDynamicParams`/
  `bindDynamicParams`/`loadConfig` 等核心函数强依赖真实 DOM 与网络
  请求，跟 M5/M7/M8 核心批次一样不适合单元测试。

## 当前状态：M11（完成，同 M1-M10 的范围原则）

M10 之后继续评估剩余候选，发现"媒体展示/下载"是另一块干净、自洽的
物理连续区间（原文件 3361-4037 行区间，约680行）——多种媒体类型判定
（image/video/audio/text/file）、结果 URL 归一化、缩略图展示、画布内
视频预览播放、下载动作，全部读写各自独立，互相调用频繁但不依赖顶层
匿名脚本或任何其它已排除的高风险区域。

M11 拆了 `media-display.js`，共59个函数。

- **唯一源码分成十三部分**：新增
  `frontend/src/canvas/media-display.js`（M11）。这是本文件里
  少数几个基础工具类模块（跟 utils.js/node-layout.js 类似），被
  `canvas-render.js`/`image-editor.js`/`cascade-run.js`/`loop-node.js`/
  `node-layout.js`/`upload.js`/`node-model.js` 等多个模块调用，因此排在
  `upload.js` 之后、`canvas-render.js` 之前加载（经典 `<script>` 之间
  函数调用是运行时解析、不要求定义顺序在调用之前，实际放哪个位置都
  不影响正确性，这里排列只是为了阅读顺序更自然）。覆盖：
  1. 媒体类型判定：`isVideoMediaItem`/`isAudioMediaItem`/
     `isTextMediaItem`/`isFileMediaItem`/`outputMediaKindForItem`/
     `defaultOutputExtForKind`/`normalizeOutputMediaItems`/
     `mediaKindForFile`/`mediaKindForItem`/`mediaKindForUrls`/
     `looksLikeImageMediaUrl`/`imageRefsOnly`/`videoRefsOnly`/
     `audioRefsOnly`。
  2. 结果 URL 归一化：`resultMediaUrls`（兼容各家 API 千奇百怪的返回
     结构，抽取出统一的 `{url, file_id, kind, name}` 列表）/
     `localDisplayUrlForMediaItem`/`imageForDisplay`。
  3. 缩略图/尺寸展示：`thumbMediaHtml`/`imageResolutionLabel`/
     `imageResolutionBadgeHtml`/`thumbDisplaySize`/`thumbItemStyle`/
     `applyThumbDisplaySizeToElement`/`singleMediaHtml`。
  4. 节点内实时媒体元素（video/audio）播放状态保存与恢复：
     `smartNodeHasLiveMedia`/`mediaSignaturePartFromElement`/
     `captureMediaPlaybackState(s)`/`restoreMediaPlaybackState(s)`/
     `transplantSmartMediaElements`（渲染重建 DOM 时把旧的 video/audio
     元素原地"移植"到新节点，避免打断正在播放的媒体）。
  5. 画布内视频预览播放/退出全屏：`captureVideoPreviewFrame`/
     `isVideoPreviewFullscreen`/`deactivateCanvasVideoPreview`/
     `handleCanvasVideoFullscreenExit`/`syncActiveCanvasVideoSize`/
     `activateCanvasVideoPreview`（含两处顶层 `document.addEventListener`
     监听全屏退出事件，随代码块一起搬移）。
  6. 文件 URL/代理/下载相关：`outputUrlLooksVideo`/`filePreviewUrl`/
     `fileThumbnailUrl`/`proxiedMediaUrl`/`thumbMediaUrl`/
     `renderedThumbSrcForRef`/`videoPosterHtml`/`displayMediaUrl`/
     `bindImageProxyFallback`/`safeExportFileName`/`fileNameFromUrl`/
     `fileIdFromUrl`/`fileDownloadUrl`/`extensionForMediaItem`/
     `downloadNameForMediaItem`。
  7. 下载动作：`downloadPreviewImage`/`downloadPreviewFile`/
     `previewDownloadGroupItems`/`downloadPreviewGroup`/
     `isGroupShortcutNode`/`downloadGroupNodeImages`。
- **刻意排除的函数**（留在 `main.js`）：`updateNodeElementDuringResize`
  及其前面的节点拖拽/缩放函数（物理上紧邻本文件开头，但是节点拖拽
  调整尺寸时的 DOM 实时更新逻辑，跟媒体展示无关，属于 canvas-render.js
  同类关注点）；`smartRunPlatformLabel`/`smartRunSnapshot`/
  `addSmartGenerationLog` 及其后的生成运行日志系统（物理上紧邻本文件
  结尾，但是"运行日志"功能——记录每次生成任务的模型/耗时/结果，不是
  媒体展示/下载功能；这个日志系统会调用本文件里的 `smartRunTaskLabel`
  ——本文件内定义，随本次搬移——是 `main.js` → `media-display.js` 的
  正向引用，跟经典脚本共享全局作用域的调用方式一致，不受先后加载
  顺序影响）。
- **回归测试**：`frontend/test/media-display.test.js`（31个测试），
  覆盖各媒体子类型判定函数、`mediaKindForItem`/`mediaKindForFile`/
  `mediaKindForUrls` 的类型综合判定、`looksLikeImageMediaUrl` 的图片
  URL 识别、`imageRefsOnly`/`videoRefsOnly`/`audioRefsOnly` 的引用
  过滤、`outputMediaKindForItem`/`defaultOutputExtForKind` 的生成结果
  类型映射、`resultMediaUrls` 兼容多种 API 返回结构与去重逻辑、
  `outputUrlLooksVideo`/`safeExportFileName`/`fileNameFromUrl`/
  `fileIdFromUrl` 的字符串处理。测试过程中发现一次自己对 `resultMediaUrls`
  去重优先级的假设有误（以为后出现的对象形式会覆盖先出现的对象形式，
  实际去重逻辑只在"先字符串后对象"时才覆盖，两个都是对象时保留先
  出现的一份）——不是生产代码 bug，是测试断言本身的预期需要按实际
  实现修正，修正后用更贴近真实场景的输入重新验证通过。
  `activateCanvasVideoPreview`/`downloadPreviewFile` 等直接操作真实
  DOM 或触发浏览器下载的函数，跟 M5/M7/M8 核心批次一样不适合单元测试。

## 当前状态：M12（完成，同 M1-M11 的范围原则）

M11 之后继续评估剩余候选，发现"候选图池"（同一图片节点一次生成多张
候选结果时的切换/展开/设为主图功能）是另一块干净的物理连续区间
（原文件 867-1126 行区间，约260行），跟 M11 的媒体展示同类——自洽的
小型功能子系统，只被已提取模块（`canvas-render.js`/`cascade-run.js`/
`node-model.js`/`image-editor.js`）当作黑盒调用。

M12 拆了 `candidate-pool.js`，共25个函数。

- **唯一源码分成十四部分**：新增
  `frontend/src/canvas/candidate-pool.js`（M12），排在
  `media-display.js` 之后、`canvas-render.js` 之前加载。覆盖：
  1. 候选图片的归一化/合并：`normalizeGeneratedCandidateImage`/
     `candidateImageKey`/`candidateImageHasRunMeta`/
     `generatedImageWithRunMeta`/`imageRunMetaForNodeFallback`/
     `generatedImageWithNodeFallback`/`applyRunMetaFromImageToNode`/
     `mergeCandidateImages`。
  2. 候选池读取与写入：`nodeCandidateImages`/
     `shouldUseCandidatePoolForImages`/`isMaskImageItem`/
     `migrateGeneratedImagesToCandidatePool`/`candidateCountForNode`/
     `setNodeMainCandidate`/`syncCandidateImageDimensions`/
     `addGeneratedCandidatesToNode`。
  3. 候选池面板 UI 状态与交互目标判定：
     `isCandidatePanelInteractionTarget`/
     `isExpandedCandidateGridInteractionTarget`/
     `closeExpandedCandidateGrids`/`closeCandidatePanel`/
     `candidatePreviewIndexForNode`/`candidateControlHtml`。
  4. 候选池面板/展开网格的 HTML 渲染：`candidateOverlayHtml`/
     `expandedCandidateGridHtml`。
- **刻意排除的函数**（留在 `main.js`）：`isSmartAssetImageNode`/
  `isUploadedImageOnlyNode`——物理上紧邻本文件开头，名字听起来跟
  候选池相关（`isUploadedImageOnlyNode` 被
  `shouldUseCandidatePoolForImages` 调用），但实际是通用的节点类型
  判定函数，被 composer（`canvas-render.js` 的 `updateComposer`）、
  `cascade-run.js`（`isSmartAssetImageNode`）等多处广泛调用，不是
  候选池专属逻辑；`createGenerationNodeByKind`（物理上紧邻本文件更
  前面）——耦合到 composer UI 的节点创建逻辑，M3 阶段已确认留在
  `main.js`，同一判断原则继续适用。
- **回归测试**：`frontend/test/candidate-pool.test.js`（21个测试），
  覆盖 `normalizeGeneratedCandidateImage` 的归一化逻辑（非图片类型
  过滤、清除 `runInputRefs`）、`candidateImageKey`/
  `candidateImageHasRunMeta` 的 key 生成与元信息判断、
  `mergeCandidateImages` 的多组去重合并（含"先出现优先，除非先出现
  的缺少运行元信息"的合并规则）、`isMaskImageItem` 的遮罩图识别、
  `shouldUseCandidatePoolForImages` 的候选池启用条件判断（多图+至少
  一张带生成元信息+全部为图片类型）、`nodeCandidateImages`/
  `candidateCountForNode` 的候选池列表读取。`candidateOverlayHtml`/
  `expandedCandidateGridHtml` 等 HTML 渲染函数和直接修改 `node` 对象
  的写入函数不在本文件覆盖范围内。

## 当前状态：M13（完成，同 M1-M12 的范围原则）

M12 之后继续评估剩余候选，发现"节点复制/粘贴 + 系统剪贴板媒体粘贴"是
另一块干净的物理连续区间（原文件 2818-2977 行区间，约160行）。

M13 拆了 `clipboard.js`，共8个函数。

- **唯一源码分成十五部分**：新增
  `frontend/src/canvas/clipboard.js`（M13），排在
  `candidate-pool.js` 之后、`canvas-render.js` 之前加载。覆盖：
  1. 节点复制/粘贴：`copySelectedNodes`/`pasteNodes`（复制/粘贴选中的
     节点及其内部连线，按"只保留流入被复制节点的连线"策略处理）。
  2. 系统剪贴板读取：`canReadSystemClipboard`/`clipboardMediaExtension`/
     `readSystemClipboardMediaFiles`（通过 `navigator.clipboard.read()`
     主动读取）/`clipboardEventMediaFiles`（从 paste 事件的
     `clipboardData` 里提取媒体文件，只取 `items` 或 `files` 其中
     一路来源避免重复）。
  3. 粘贴内容路由：`pasteClipboardContent`（判断当前应该粘贴系统
     剪贴板媒体文件还是内部节点剪贴板，按时间戳判断谁更"新"）/
     `pasteFromContextMenu`（右键菜单粘贴，主动读取系统剪贴板）。
- **刻意排除的函数**（留在 `main.js`）：`imageMetaFromNode`/
  `applyNodeMetaToImage`（物理上紧邻本文件开头）——图片元数据处理
  的小工具函数，跟复制/粘贴无关，只是碰巧写在附近；
  `duplicateForAltDrag`（物理上紧邻本文件结尾）——Alt+拖拽复制节点
  的逻辑跟 `pasteNodes` 内部实现相似（都调用 `cloneSmartNode` 复制
  节点+连线），但触发方式是拖拽交互而不是剪贴板，且只被
  `canvas-render.js` 的 `bindNodeEvents` 拖拽处理器调用，属于节点
  拖拽交互的一部分，不是剪贴板功能，本次不动。
- **回归测试**：`frontend/test/clipboard.test.js`（10个测试），覆盖
  `clipboardMediaExtension` 的 MIME 类型映射表（含大小写不敏感、
  未知类型兜底）、`canReadSystemClipboard` 的浏览器能力检测、
  `clipboardEventMediaFiles` 的媒体文件提取逻辑（items 优先、
  files 兜底、非媒体类型过滤、空输入不抛错）。`copySelectedNodes`/
  `pasteNodes`/`pasteFromContextMenu` 等函数强依赖真实 DOM/node
  全局状态/`navigator.clipboard` 异步 API，跟 M5/M7/M8 核心批次一样
  不适合单元测试。

## 当前状态：M14（完成，同 M1-M13 的范围原则）

M13 之后继续评估剩余候选，发现"节点悬浮快捷栏 + 右键菜单"是另一块
干净的物理连续区间（原文件 2162-2483 行区间，约320行）——两套互相
独立但都属于"选中态操作面板"范畴的 UI 子系统，虽然会调用几乎所有
其它已拆分模块的函数（当作纯粹的动作分发器），但没有顶层匿名事件
绑定，函数边界清晰。

M14 拆了 `node-context-ui.js`，共16个函数。

- **唯一源码分成十六部分**：新增
  `frontend/src/canvas/node-context-ui.js`（M14），排在
  `clipboard.js` 之后、`canvas-render.js` 之前加载。覆盖：
  1. 节点悬浮快捷栏（选中单个图片/媒体节点时，节点上方浮现的一排
     快捷按钮：下载/加入资产/全屏/对比/编辑等）：
     `nodeShortcutTargetFor`（找到当前应该操作的具体媒体引用）/
     `shouldShowNodeShortcutBar`（判断当前是否该显示快捷栏，排除
     拖拽中/多选/prompt与loop节点等场景）/`nodeShortcutBarHtml`/
     `positionNodeShortcutForNode`（按节点在视口中的位置计算快捷栏
     悬浮坐标）/`bindNodeShortcutOverlayEvents`/`updateNodeShortcutBar`/
     `triggerNodeShortcutAction`（按钮点击后的动作分发：下载/加入
     资产/全屏预览/对比/进入图片编辑器等）。
  2. 右键菜单（节点右键菜单 + 画布空白处右键菜单）：
     `closeNodeContextMenu`/`nodeContextMenuHtml`/`openNodeContextMenu`/
     `canvasContextMenuHtml`/`openCanvasContextMenu`/
     `triggerCanvasContextAction`（新建生成节点/分组/撤销等画布级
     动作）/`openParentFeedback`（跳到父页面的反馈入口，iframe 场景）/
     `triggerNodeContextAction`（保存/下载/复制/粘贴/删除/反馈等
     节点级动作）/`bindNodeContextMenuEvents`。
- **风险判断依据**：这两套子系统本质上是"选中态操作面板的动作分发
  器"，会调用 `asset-library.js`（`openNodeAssetSaveModal`）/
  `clipboard.js`（`copySelectedNodes`/`pasteFromContextMenu`）/
  `media-display.js`（`downloadPreviewFile`/`downloadGroupNodeImages`）/
  `image-editor.js`（`openImagePreview`/`openImageEditor`/
  `compareSourcesForNode`/`refreshComparePanel`）以及仍留在 `main.js`
  的 `deleteNode`/`ungroupNode`/`createGenerationNodeByKind`/
  `performUndo` 等，但这些全是经典脚本共享全局作用域下的普通函数
  调用，跟谁先加载谁后加载无关；也没有发现类似 prompt-node/composer
  那种跟顶层匿名脚本控制流直接交织的情况，是安全的。
- **回归测试**：`frontend/test/node-context-ui.test.js`（14个测试），
  覆盖 `nodeShortcutTargetFor` 的目标媒体引用查找逻辑（`selectedImage`
  匹配优先、不匹配时回退到第一张有效引用）和 `shouldShowNodeShortcutBar`
  的显示条件判断（排除多选/未选中/prompt与loop节点/缩略图拖拽中/
  拖动其它节点或多节点批量拖动/缩略图已分离等场景，只在"单选当前
  图片节点、无干扰性拖拽状态、且有有效媒体引用"时显示）。
  `nodeShortcutBarHtml`/`nodeContextMenuHtml`/`openNodeContextMenu`/
  `openCanvasContextMenu` 等 HTML 渲染/DOM 操作函数强依赖真实 DOM
  元素，跟 M5/M7/M8 核心批次一样不适合单元测试。

## 当前状态：M15（完成，同 M1-M14 的范围原则）

M14 之后继续评估剩余候选，发现"工作流导入导出"弹窗是另一块干净的
物理连续区间（原文件 531-732 行区间，约200行）——把选中节点/连线
打包导出为 JSON 或带资源的 zip 模板包，或反过来导入追加到当前画布。

M15 拆了 `workflow-transfer.js`，共13个函数。

- **唯一源码分成十七部分**：新增
  `frontend/src/canvas/workflow-transfer.js`（M15），排在
  `node-context-ui.js` 之后、`canvas-render.js` 之前加载。覆盖：
  1. API 错误信息提取（本文件专属，不是 `upload.js`/M6 那套通用配额
     基础设施 `smartResponseErrorMessage`）：`apiErrorMessage`/
     `responseErrorMessage`。
  2. 下载与文件命名：`downloadBlob`/`smartWorkflowFilename`。
  3. 序列化/反序列化：`serializableSmartNode`（清空运行态字段，只留
     可复用的节点配置）/`selectedSmartWorkflowPayload`（打包当前选中
     节点+内部连线）/`normalizeImportedSmartWorkflow`（兼容三种可能
     的导入 JSON 结构：数组/`{nodes,connections}`/`{workflow:{...}}`）。
  4. 弹窗生命周期：`openSmartWorkflowTransferModal`/
     `closeSmartWorkflowTransferModal`/`updateSmartWorkflowTransferMeta`。
  5. 导出/导入动作：`exportSelectedSmartWorkflow`（纯 JSON 或带资源
     的 zip 包，调用 `/api/canvas-workflows/export`）/
     `insertSmartWorkflowIntoCanvas`（把导入的节点重新分配 id、平移
     到视口中心、重建连线映射后插入画布）/`importSmartWorkflowFile`
     （上传模板文件，调用 `/api/canvas-workflows/import`）。
- **命名容易引起误判的一点**：`responseErrorMessage`/`apiErrorMessage`
  名字听起来是通用的 API 错误处理基础设施，但 grep 验证后发现只被
  本文件内的 `exportSelectedSmartWorkflow`/`importSmartWorkflowFile`
  调用——项目里另有一个名字很相似的 `smartResponseErrorMessage`
  （M6 阶段确认的通用配额/错误基础设施，留在 `main.js`），两者是
  完全不同的两个函数，不要混淆。
- **刻意排除的函数**（留在 `main.js`）：`cloneSmartSettings`/
  `settingsForStorage`/`isApiLikeEngine`/`mediaItemForStorage` 等
  （物理上紧邻本文件开头）——通用的设置/存储序列化工具函数，被
  `cascade-run.js`/`candidate-pool.js` 等多个模块广泛调用，不是工作流
  导入导出专属逻辑；`smartSettingsModeKey` 及其后的"最近使用设置"
  记忆系统（物理上紧邻本文件结尾）——跟工作流导入导出是完全不同的
  两个子系统，只是碰巧物理上写在了一起。
- **回归测试**：`frontend/test/workflow-transfer.test.js`（16个
  测试），覆盖 `apiErrorMessage` 从各种可能的后端错误响应结构里提取
  可读错误文案（字符串/FastAPI 风格的 detail 数组/普通对象/兜底
  JSON）、`normalizeImportedSmartWorkflow` 归一化三种导入 JSON 结构、
  `smartWorkflowFilename` 按画布标题+时间戳生成导出文件名（含非法
  字符清理、空格替换、超长标题截断、无标题时的兜底）。
  `exportSelectedSmartWorkflow`/`importSmartWorkflowFile`/
  `insertSmartWorkflowIntoCanvas` 等函数强依赖真实 DOM/网络请求/node
  全局状态，跟 M5/M7/M8 核心批次一样不适合单元测试。

## 当前状态：M16（完成，同 M1-M15 的范围原则）

修完当天的线上 bug（M3 拆分时手滑漏迁移了 `MEDIA_NODE_DEFAULT_SCALE`
等 10 个常量声明，导致打开已有画布时卡在"正在载入画布"，详见
下方"线上事故复盘"一节）之后，继续评估剩余候选。M9 阶段的架构备注
里提到"画布多端协作合并系统"是一个尚未拆出的独立子系统（当时因为
物理上和 asset-library.js 交叠而搁置），现在单独评估发现它是一块
自洽的、不涉及顶层匿名脚本的区域，适合作为下一个拆分目标。

M16 拆了 `canvas-sync.js`，共10个函数。

- **唯一源码分成十八部分**：新增
  `frontend/src/canvas/canvas-sync.js`（M16），排在
  `workflow-transfer.js` 之后、`canvas-render.js` 之前加载。覆盖多端
  协作场景下，服务器广播 `canvas_updated` 之后如何把远端画布数据和
  本地当前编辑状态合并：
  1. 图片列表合并：`mergeSmartImageLists`（按 url 去重，本地在前）。
  2. 节点合并：`smartNodeInFlight`（判断节点是否正在生成/排队中）/
     `mergeSmartNode`（本地正在生成的节点以本地为准，只并入对方多出
     来的图，避免被对方旧状态冲掉；否则以对方为基底，图片仍取并集）/
     `mergeSmartNodeLists`（按首次出现顺序合并两份节点列表，仅一方
     存在的节点直接保留）。
  3. 连线合并：`mergeSmartConnections`（按 `from->to:kind` 去重，且
     过滤掉端点不在合并后节点集合里的悬空连线）。
  4. 合并落地与触发：`applyMergedServerCanvas`（把合并结果写回
     `nodes`/`canvas.connections`/`canvas.title` 并重新渲染）/
     `mergeReloadCanvasNow`（拉取服务器最新画布并合并，拖拽/框选中会
     推迟执行）/`scheduleCanvasMergeReload`（防抖调度）/
     `handleCanvasUpdatedMessage`（WebSocket 收到 `canvas_updated`
     后的入口，过滤自己发的消息和正在保存时的消息）/
     `startCanvasMetaPoll`（WS 不可靠时的兜底定时轮询）。
- **刻意排除的状态变量**（留在 `main.js`）：`smartClientId`（客户端
  id 常量）以及 `canvasSyncInFlight`/`canvasSaveDirty`/
  `canvasSaveAgain`/`canvasSyncTimer`/`canvasMetaPollTimer` 这五个
  `let` 状态变量——被 `scheduleSave`/`saveCanvas`（同样留在 `main.js`）
  大量读写，是跨函数可变状态耦合，风险量级和"仍然搁置的 `state.js`"
  一致，本次只搬移读写它们的函数本体，状态本身不搬。函数搬到新文件
  后依然通过经典脚本共享的顶层脚本作用域读写这些变量——本次拆分过程
  中专门验证过一点：classic `<script>` 里用 `const`/`let` 声明的顶层
  变量（不像 `var`/函数声明那样会挂到 `window` 上）**依然可以被其它
  后加载的 `<script>` 标签在"调用时"访问到**，只要访问发生在声明脚本
  执行完之后——这也是为什么 `cascade-run.js`（加载顺序在 `main.js`
  之前）能在函数体内正常引用 `main.js` 里声明的 `smartClientId` 常量。
- **刻意排除的函数**（留在 `main.js`）：`connectAssetLibrarySyncSocket`
  ——单个共享 WebSocket，同时分发 `asset_library_updated`（资产库）
  和 `canvas_updated`（本文件）两类消息，物理上无法拆分成单一职责
  模块，原因同 M9 `asset-library.js` 里的说明。
- **回归测试**：`frontend/test/canvas-sync.test.js`（18个测试），
  覆盖 `mergeSmartImageLists` 的去重/空输入/无 url 项目行为、
  `smartNodeInFlight` 的各种进行中状态判断、`mergeSmartNode` 在
  "本地进行中"和"本地空闲"两种场景下的基底选择与图片并集、
  `mergeSmartNodeLists` 的顺序保持与仅一方存在节点的处理、
  `mergeSmartConnections` 的去重与悬空连线过滤。
  `applyMergedServerCanvas`/`mergeReloadCanvasNow`/
  `scheduleCanvasMergeReload`/`handleCanvasUpdatedMessage`/
  `startCanvasMetaPoll` 强依赖真实 DOM/网络请求/定时器/画布全局状态，
  跟 M5/M7/M8 核心批次一样不适合单元测试。

## 线上事故复盘（M3 遗留 bug，2026-08-05 发现并修复）

打开一个此前已存在的画布时，页面卡在"正在载入画布"加载动画
不消失。浏览器控制台报 `ReferenceError: MEDIA_NODE_DEFAULT_SCALE is
not defined`，报错栈经过 `nodeScale`/`mediaNodeDefaultScale`
（`node-layout.js`，M3 拆分）→ `nodeRect`/`render`/`renderMinimap`
→ `applyViewport`/`loadCanvas` → `window.onload`。

**根因**：M3 拆分 `nodeScale`/`mediaNodeDefaultScale` 时，`git diff`
显示这两个函数紧跟着 10 个常量声明（`MEDIA_NODE_DEFAULT_SCALE`/
`MEDIA_GROUP_DEFAULT_SCALE`/`MEDIA_GROUP_THUMB_BASE`/
`EMPTY_GENERATION_NODE_WIDTH`/`EMPTY_GENERATION_NODE_HEIGHT`/
`SMART_GROUP_DEFAULT_WIDTH`/`SMART_GROUP_DEFAULT_HEIGHT`/
`SMART_GROUP_LEGACY_HEIGHT`/`SMART_GROUP_MIN_WIDTH`/
`SMART_GROUP_MIN_HEIGHT`）——这些常量当时的设计意图是"留在
main.js"（`node-layout.js` 文件头的注释也确实这样写了），但实际
删除 `frontend/src/canvas/main.js` 里的函数区间时，连带把这 10 行
常量声明一起删掉了，且从未补回任何地方，变成了"哪个文件都没有
声明"。因为这些常量只在函数体内部被引用（不是模块顶层立即执行的
代码），所以当时的 10 步校验流程里的"语法检查"/"vm 交叉模拟"都没
测出来（vm 模拟的 sandbox 里手动 stub 了这些常量，反而掩盖了问题）；
真正会用到这些常量的路径（渲染一个已有节点的画布）也没有被 M1-M15
任何一个模块的单元测试覆盖到，因为那些测试都是用手造的最小化输入
调用纯函数，不会经过"渲染整个画布"的完整调用链。

**修复**：把这 10 个常量声明原样补回 `frontend/src/canvas/main.js`
里 M3 拆分注释的位置。

**教训**：
1. 物理搬移一个函数区间时，`git diff` 的校验重点应该同时覆盖
   "函数签名"和"函数区间紧邻的顶层变量/常量声明"——后者容易在
   区间删除时被误伤，且报错时机是运行时才触发（首次真正调用到该
   函数时），比语法错误更隐蔽。
2. vm 交叉模拟测试如果手动 stub 了外部依赖的全局变量，反而会掩盖
   "这个全局变量在所有源文件里其实都没有声明"这类问题——stub 应该
   只用于"确认设计上就是留在别处、且别处确实有声明"的变量，而不是
   不加区分地为了让测试跑通就 stub。
3. 目前 15+ 个模块的单元测试全部是针对纯函数的最小化单元测试，
   没有一个"完整加载 17 个文件 + 模拟真实画布数据跑一次 render()"
   的集成测试，这类回归只有真实浏览器测试才能发现。这次是用户在
   真实浏览器里测试时报出来的，不是自动化测试发现的。

## 当前状态：M17（完成，同 M1-M16 的范围原则）

M16 之后重新评估提示词模板/composer 大系统。之前（M8 阶段）认为这整块
和 ~1400 行顶层匿名脚本深度耦合、风险太高而整体搁置；M17 用更细的
粒度重新检查，发现"预设/模板库的加载-保存-渲染-增删改查"这部分其实
是一块干净的连续区间（原文件 1314-1970 行），不包含任何顶层匿名脚本
语句（用 `grep "^[a-zA-Z_$]\+\??\.\(addEventListener\|onclick\|onchange\)"`
之类的模式扫描确认），只是被顶层匿名脚本"调用"（点击模板分类 tab/
搜索框输入/编辑模式切换等事件绑定，重新赋值几个状态变量后调用
`renderPromptTemplatePanel()`），这和 M10/M14 已验证过的"简单函数调用
触发重渲染"是同一个安全模式，不是 `onmousemove`/`onmouseup` 那种函数体
直接写在事件处理器闭包内部的高风险耦合。于是决定先拆出这一块。

M17 拆了 `prompt-templates.js`，共45个函数。

- **唯一源码分成十九部分**：新增
  `frontend/src/canvas/prompt-templates.js`（M17），排在
  `canvas-sync.js` 之后、`canvas-render.js` 之前加载。覆盖提示词预设
  （个人保存的提示词片段）和提示词模板库（内置模板 + 远程模板库）的
  完整生命周期：
  1. 本地存储读写：`loadPromptPresets`/`savePromptPresets`/
     `loadPromptTemplateGroups`/`savePromptTemplateGroups`/
     `loadPromptTemplateOverrides`/`savePromptTemplateOverrides`。
  2. 模板库加载与选择：`loadPromptTemplates`（从 `/api/prompt-libraries`
     加载，远程库为空时兜底到旧版 `/api/canvas/prompt-templates`）/
     `activePromptLibrary`/`renderPromptLibrarySelect`。
  3. 模板数据查询/格式化：`promptTemplateItems`（按当前库汇总内置
     模板+个人预设+远程模板项）/`promptTemplateText`（拼接正向/负向/
     参数文案）/`promptTemplateName`/`promptTemplateScene`（中英文
     字段回退）/`promptTemplateSearchText`/`activePromptTemplateGroups`/
     `promptTemplateCategoryLabel`/`promptTemplateSelectedItem`/
     `defaultPromptTemplateGroups`。
  4. 预设管理：`currentPromptPreset`/`defaultPromptPresetName`/
     `promptPresetPanelNode`/`setPromptPresetStatus`/
     `resetPromptPresetDeleteState`/`createPromptPresetFromNode`/
     `createPromptPresetFromComposer`/`savePromptNodeAsPreset`/
     `renderPromptPresetPanel`/`openPromptPresetPanel`/
     `closePromptPresetPanel`。
  5. 模板面板渲染与交互：`promptTemplateScrollSnapshot`/
     `restorePromptTemplateScroll`/`renderPromptTemplatePanel`（最大的
     一个函数，渲染分类 tab/分组管理面板/模板卡片列表/详情与编辑区）/
     `activePromptTemplateNodeId`/`syncComposerTemplateButton`/
     `openPromptTemplatePanel`/`closePromptTemplatePanel`/
     `applyPromptTemplateToNode`/`editPromptPresetForNode`。
  6. 模板 CRUD（远程库走 API，内置库走 localStorage 覆盖层，个人预设
     走 localStorage）：`saveCurrentPromptAsTemplate`/
     `createBlankPromptTemplate`/`savePromptTemplateEdit`/
     `deletePromptTemplate`/`createPromptTemplateGroup`/
     `renamePromptTemplateGroup`/`deletePromptTemplateGroup`。
- **刻意排除的状态变量**（留在 `main.js`）：`promptPresets`/
  `builtinPromptTemplates`/`promptLibraries`/`activePromptLibraryId`/
  `promptTemplateGroups`/`promptTemplateOverrides`/
  `promptTemplateCategory`/`promptTemplateSelectedId`/
  `promptTemplateEditing`/`promptTemplateGroupEditMode`/
  `promptPresetDeleteArmed`——原因同 M16 `smartClientId`：被顶层匿名
  脚本里模板面板的分类/搜索/编辑模式点击事件直接读写，属于跨函数可变
  状态耦合，本次只搬移读写它们的函数本体。另外 `openPromptTemplatePanel`
  内部会重新赋值核心选中状态 `selectedId`/`selectedIds`/`selectedImage`
  （和 M2 `loop-node.js` 的 `selectedId = node.id` 同一个经典脚本共享
  作用域写法，已验证可行）。
- **刻意排除的函数**（留在 `main.js`）：`promptNodeBodyHtml`/
  `bindPromptNodeControls`/`bindScrollableText`——smart-prompt 节点
  自身的渲染与交互逻辑，物理上紧邻本文件之后，是不同的子系统（节点
  本身 vs 模板库管理），M8 阶段已经确认过这个边界；
  `smartRuleTemplateItems`/`smartRuleTemplateOptions`/
  `smartRuleTemplateContent`——物理上紧邻 `promptNodeBodyHtml` 之前，
  命名容易和本文件的"提示词模板库"混淆，但其实是完全不同的"提示词
  规则模板"概念，独立留在 `main.js`；@mention 选择器/输入引用图片
  收集/`buildPromptRequest` 等和图片生成 composer 深度耦合、且和
  ~1400 行顶层匿名脚本交织的部分——仍然是未来更高风险的拆分目标，
  本次不动。
- **回归测试**：`frontend/test/prompt-templates.test.js`（18个测试），
  覆盖 `defaultPromptPresetName` 的首行截取/超长截断/空文本兜底、
  `promptTemplateText` 在 builtin/非 builtin 模板和 positive/full
  两种模式下的拼接行为、`promptTemplateName`/`promptTemplateScene`
  的中英文字段回退逻辑、`promptTemplateSearchText` 的多字段拼接（含
  确认 `Array.join` 对缺失字段的行为是转空串而不是字面 `"undefined"`
  的踩坑记录）、`defaultPromptTemplateGroups` 的固定分组列表、
  `currentPromptPreset` 的按 id 查找。`renderPromptTemplatePanel`/
  `renderPromptPresetPanel` 等渲染函数和所有远程 API 调用的 CRUD
  函数强依赖真实 DOM/网络请求，跟 M5/M7/M8 核心批次一样不适合单元
  测试。

## M18：window.onmousemove/onmouseup 具名化（不是物理拆分，是前置的
## 安全化改造）

M7 阶段发现 `window.onmousemove`/`window.onmouseup` 是两个用
`window.onxxx = e => {...}` 匿名函数表达式赋值的形式，不是具名函数
声明，这导致基于 AST 的符号扫描（`get_document_symbols`）完全看不到
它们，只能靠 `grep -n "^window\."` 之类的模式搜索才能发现。当时判断
"物理搬移函数体"风险太高（10+ 种互斥交互状态耦合，横跨图片编辑器/
资产库/连线等多个模块），把这两个函数原样留在 `main.js`，只是记录了
这个架构事实。

M18 只做一件很小、但能解锁后续可能性的事：把这两个匿名箭头函数
**原地**改写成具名函数声明 + 单独一行赋值——
`function handleWindowMouseMove(e){...}` +
`window.onmousemove = handleWindowMouseMove;`（`onmouseup` 同理，
改成 `handleWindowMouseUp`）。这是纯语法转换，函数体一个字符都没有
改动（`git diff` 校验过，diff 里只有声明行的增删，函数体内容零改动），
不涉及任何逻辑变化、不做物理文件搬移、不改变作用域规则——两个函数
用到的所有共享状态变量（`dragState`/`panState`/`cropDrag`/
`thumbDragState`/`portDragState`/`promptResizeState`/`selectionState`/
`previewCompareDrag`/`previewPanDrag`/`imageEditPanDrag`/
`smartMinimapDrag`/`rightMouseDownPoint`/`didPan`/`lastMouseWorld` 等
至少15个）访问方式跟改造前完全一样。

**为什么现在做这个改造**：这是为"以后真要把这两个函数物理搬到
`canvas-render.js`"铺路的最小前置步骤——具名之后至少能被 AST 工具
正确识别、能用 `lookup_symbols` 精确定位，而不必每次都用正则去猜
边界。**这次没有走到"物理搬移"这一步**：评估发现这两个函数依赖的
共享可变状态变量数量（15+个）和被跨函数读写的密度，明显高于 M16/
M17 已经安全拆过的 `smartClientId`/`promptTemplateCategory` 等（通常
只有几个状态变量、且读写点相对集中），物理搬移的收益（`main.js`
已经从 16590 行降到 6554 行，边际收益变小）不足以覆盖新增的风险，
所以决定只做"具名化"这一步就停，物理搬移继续留给未来更谨慎的评估。

- **验证方式**：`git diff` 确认改动范围精确到只有两处声明行的转换，
  函数体内容零改动；`node --check` 语法检查；`lookup_symbols` 确认
  `handleWindowMouseMove`/`handleWindowMouseUp` 现在能被 AST 工具
  正确识别到（行号范围精确）；全量前端 310 测试 + 后端 4 测试保持
  全绿（这个改动不影响任何被测函数，纯粹是这两个未被单测覆盖的大
  事件处理器本身的声明语法变化）。
- **没有新增测试**：`handleWindowMouseMove`/`handleWindowMouseUp`
  本身强依赖真实鼠标事件/DOM 状态，跟改造前一样不适合单元测试，
  这次改造也没有让它们变得可测——只是变得"可被工具发现"。

## M19：window.onmousemove/onmouseup 物理拆分到 canvas-render.js

M18 已经把这两个函数从匿名箭头函数改成了具名函数声明，M19 在此基础上
完成真正的物理搬移——把 `handleWindowMouseMove`/`handleWindowMouseUp`
（连同物理上紧邻、逻辑上相关的 `finishCanvasRightClick`/
`cancelCanvasRightClick` 右键拖拽取消处理，以及两行
`window.addEventListener('pointerup'/'pointercancel', ...)`）整体搬到
`canvas-render.js` 末尾——它们和该文件里已有的 `dragConnectTargetFor`/
`rectOverlapNode`/`canAutoConnectDraggedNode`/`restoreDraggedNodePosition`
（M7 已迁移）本来就是同一个"节点拖拽/画布交互"关注点。

**风险重新评估（相比 M7/M18 阶段的判断）**：详细梳理后发现，这两个
函数调用的外部函数里，18 个已经分布在其它已拆分模块（`connections.js`/
`image-editor.js`/`node-model.js`/`asset-library.js`/`loop-node.js`/
`node-layout.js`），只有 14 个仍留在 `main.js`（`updateCanvasRightPan`/
`centerViewportOnWorldPoint`/`minimapEventToWorld`/`updateSelectionBox`/
`applyViewport`/`flushDeferredViewportRendering`/`applyNodeMetaToImage`/
`inheritNodeMetaFromImage`/`commitPendingUndo`/`discardPendingUndo`/
`moveNodeElementsDuringDrag`/`updateLoopInsertPreview`/`setDropHighlight`/
`clearDropHighlight`/`setAssetDragOver`/`finishSelection`/
`mergeImageNodesIntoGroup`/`smartGroupTargetForDraggedNode`/
`addDraggedNodesToSmartGroup`），这些都是通过共享脚本作用域的简单函数
调用，物理位置不影响调用方式——跟 M9/M16/M17 已经验证过的模式一致。
真正的风险集中在**状态变量数量**（15+ 个跨函数共享读写的可变交互
状态），但这类风险在"函数搬到哪个文件"和"函数留在原地"之间并无区别
——状态变量本身完全不动，只是读写它们的代码换了个文件存放，这一点
和 M16 `smartClientId`、M17 `promptTemplateCategory` 的处理方式一致。

- **验证方式**：byte-diff 校验搬移内容和原文件一字不差；跨文件 grep
  确认这4个函数（`handleWindowMouseMove`/`handleWindowMouseUp`/
  `finishCanvasRightClick`/`cancelCanvasRightClick`）在 main.js 里
  各 0 个定义、在 `canvas-render.js` 里各 1 个定义；`window.onmousemove`/
  `window.onmouseup` 赋值语句各只出现在 `canvas-render.js` 里一次；
  `git diff` 排查确认没有引入重复声明；18 个手写模块 + main.js 的 vm
  交叉模拟（含更完整的 `document.elementFromPoint`/`window.addEventListener`
  等桩）确认零 `ReferenceError`，且 `window.onmousemove`/`onmouseup`
  在共享上下文里正确解析为 `function` 类型；全量前端 310 测试 + 后端
  4 测试保持全绿。
- **测试基础设施的连带修复**：`canvas-render-sandbox.js` 原来的
  `window: {}` 桩缺少 `addEventListener`——M19 追加的两行顶层
  `window.addEventListener('pointerup'/'pointercancel', ...)` 调用是
  模块加载时立即执行的语句（不是延迟到函数调用时才执行），导致
  sandbox 加载模块阶段直接抛错，连带让所有跟这次改动完全无关的纯
  函数测试（`formatRunDuration` 等）也失败。修复方式是给 sandbox 的
  `window`/`document` 补上最基本的 `addEventListener`/`elementFromPoint`
  桩——这是一个值得记住的教训：**往一个已有模块末尾追加包含顶层
  副作用语句的代码时，必须重新检查该模块现有 sandbox 的桩是否够用**，
  不能假设"新加的函数不测试就不用管 sandbox"。
- **没有新增测试**：这4个函数本身依赖 15+ 个交互状态变量和真实 DOM
  事件，跟改造前一样不适合单元测试。

## M20：顶层匿名脚本全面具名化（块2a）

M18/M19 已经把 `onmousemove`/`onmouseup` 具名化并搬移，但当时的架构
备注提到"~1400 行顶层匿名脚本"远不止这两个——`main.js` 里还有 63 处
`obj.addEventListener('event', e => {...})` / `obj.onxxx = e => {...}`
形式的顶层匿名事件处理器（画布交互/键盘快捷键/图片编辑器/资产库
面板/工作流导入导出/提示词模板面板/composer 输入框等几乎所有 UI
交互的事件绑定），全部散落在 `get_document_symbols` 扫描不到的匿名
函数表达式里。M20 把这 63 处**全部**转换成具名函数声明 + 单独一行
注册/赋值语句，纯语法转换，不改变任何行为。

**为什么能大批量安全完成**：写了一个基于花括号平衡（正确跳过字符串/
模板字符串/正则/注释）的 Python 脚本定位每一处顶层匿名处理器的函数体
边界，生成形如 `<对象名><事件名>Handler` 的具名函数（重名加数字后缀，
比如 `shellMousedownHandler`/`shellMousedownHandler2`/
`shellMousedownHandler3`），原地替换。转换完成后跑了两层独立校验：
1) 逐个比较"旧文件里 63 处 handler 的花括号内容"和"新文件里 63 个新增
具名函数的花括号内容"，确认逐字节相同；2) 用 `diff` 命令直接比较新旧
文件，人工审查每一处 diff 只包含"箭头函数头 → 具名函数声明"和"原语句
→ 引用具名函数"这两类预期变化，额外参数（比如 `document.addEventListener(...,
true)` 的第三个 capture 参数、`shell.addEventListener('wheel', ..., {passive:false})`
的第三个 options 参数）全部正确保留；3) `async` 关键字在 `shell.ondrop`/
`window.onload` 等场景下正确保留到新的具名函数声明上；4) 检查 63 个
新生成的函数名在全文件范围内没有跟任何已有声明重名。

- **验证方式**：`node --check` 语法检查；上述两层独立字节级校验
  （函数体逐字节比较 + `diff` 人工审查）；vm 交叉模拟——用真实的 18
  个手写模块 + 转换后的 main.js 按生产环境加载顺序在共享上下文里
  执行一遍，确认顶层脚本（现在包含 63 个新函数声明和赋值语句）整体
  执行零 `ReferenceError`，这是比"函数体字节校验"更进一步的验证，因为
  它证明了转换后的代码不仅长得对，运行时也真的能正常走完；全量前端
  310 测试 + 后端 4 测试保持全绿。
- **效果**：`get_document_symbols` 现在能扫描到 `main.js` 里**全部**
  函数——不再有任何匿名的顶层事件处理器藏在扫描盲区。这是为块2b
  （拆分 @mention/composer 核心系统）铺路的关键前置步骤：现在可以用
  标准 AST 工具精确看到每个函数的边界和调用关系，不再需要靠 grep
  猜测顶层脚本的结构。
- **没有新增测试**：这 63 个新具名函数本身依赖大量真实 DOM 事件/
  全局交互状态，跟改造前一样不适合单元测试——这次纯粹是"让代码结构
  对工具可见"，不改变可测试性。

## M21：@mention 提及系统 + 提示词节点 composer 拆分（块2b）

M20 让整个 main.js 对 AST 工具完全可见之后，重新用标准工具（不再靠
grep 猜测）精确梳理 M8 阶段搁置的"提示词模板/预设/composer/@mention
大系统"剩余部分（M17 已经拆走了"预设/模板库管理"）。发现真正的
"@mention + composer + 生成请求引用图片收集"核心是一块不含任何顶层
匿名脚本语句的区域，物理上分两段不连续区间（原文件 2192-2598 行 +
2780-3461 行），中间 2609-2779 行是 M6 阶段确认的通用配额/尺寸计算
基础设施，物理上夹在中间但完全不相关。

M21 拆了 `mention-composer.js`，共79个函数，是仅次于 M8
`image-editor.js`（约90个函数）的第二大单个模块。

- **唯一源码分成二十部分**：新增
  `frontend/src/canvas/mention-composer.js`（M21），排在
  `prompt-templates.js` 之后、`canvas-render.js` 之前加载。覆盖两大
  子系统：
  1. **提示词节点 composer**（`promptComposer` 面板——注意跟 main.js
     里仍保留的 `updateComposer`/`positionComposerForNode` 操作的是
     另一个 DOM 元素 `composer`，即图片生成节点的参数面板，两者是
     完全独立的两个 UI，命名相似但不要混淆，这是本次评估时特别确认
     排除的一点）：`positionPromptComposerForNode`/
     `promptComposerParamsHtml`/`renderPromptComposer`/
     `bindPromptComposerControls`/`updatePromptComposer`/
     `renderInputPromptPreview`/一系列 RunningHub 输入缩略图渲染函数/
     `renderInputThumbsRow`/`renderPromptComposerThumbs`/
     `renderPromptComposerInputPreview`，以及输入引用缩略图的拖拽排序
     交互（`bindInputThumbsDrag`/`inputThumbDropPlacement`/
     `clearInputThumbDropMarkers`/`movedBeforeAfterIds`/
     `sameOrderedIds`/`reorderInputSourceNodes`/`reorderInputThumb`）。
  2. **@mention 提及系统 + 生成请求引用图片收集**：`mentionTokenHtml`/
     `promptHtmlWithMentionTokens`（@提及 token 的 HTML 渲染）、
     运行元信息快照/清理（`snapshotRunMeta`/`attachRunMeta`/
     `stripRunInputMeta`/`stripImageGenerationMeta`）、根据画布连线
     关系/@提及内容/候选池等多种来源推导节点生成时实际引用图片的一大
     批函数（`upstreamNodesForKinds`/`inputNodesFor`/`imagesForNode`/
     `runInputRefsForNode`/`defaultReferenceImagesFor`/
     `lineConnectionsFor`/`connectedLineNodeIds` 等三十多个，是整个
     画布最复杂的一套推导逻辑）、@提及选择器候选图片来源汇总
     （`inputMentionCandidateImages`/`assetMentionCandidateImages`/
     `mentionCandidateImages`/`referenceImagesFor`）、@提及选择器弹出
     面板本体（`closeMentionPicker`/`renderMentionPicker`/
     `showMentionPicker`/`positionMentionPickerAtCaret`/
     `maybeOpenMentionPicker`/`insertMentionToken`）、最终把提示词
     文本+引用图片组装成生成请求体的出口函数
     （`collectPromptParts`/`originalPromptTextFromParts`/
     `buildPromptRequest`）。
- **刻意排除的函数**（留在 `main.js`，物理上夹在两段区间中间，容易
  引起误判）：`StorageQuotaSignal`/`quotaDataFromPayload`/
  `checkQuotaWarningFromResult`/`smartResponseError`/
  `smartResponseErrorMessage`（M6 阶段确认的通用配额/错误处理基础
  设施，被 `cascade-run.js` 大量调用，跟本文件毫无关系）；
  `sizeForRun`/`expectedOutputSize`/`pendingBoxSize` 等一系列"预期
  输出尺寸计算"函数（渲染占位框大小用的，跟本文件"引用图片收集"是
  完全不同的关注点，命名容易混淆但概念不同）；`updateComposer`/
  `positionComposerForNode`（操作另一个 DOM 元素 `composer`，见上）。
- **回归测试**：`frontend/test/mention-composer.test.js`（24个测试），
  覆盖 `sameOrderedIds`/`movedBeforeAfterIds` 的拖拽排序辅助逻辑、
  `originalPromptTextFromParts` 把结构化提示词片段还原成纯文本（含
  @图片 token 还原、多余空格/空行清理）、`mentionTokenHtml` 渲染
  @提及 token 的 HTML（图片/视频两种媒体类型、alias 优先于 name、
  无 url 时的空返回）、`isGeneratedResultNode` 判断一个节点是否是
  生成结果节点的多种条件分支。`renderMentionPicker`/
  `renderPromptComposer`/`buildPromptRequest`/各种 `xxxImagesFor`
  引用图片收集函数强依赖真实 DOM（Selection API/contenteditable
  光标位置）/画布全局状态/网络请求，跟 M5/M7/M8 核心批次一样不适合
  单元测试。

## M22：state.js 真正提取——核心状态变量物理搬移（块3，最终里程碑）

这是本次会话计划的第三块也是最后一块高风险区域。之前多次评估都判断
"风险量级和物理搬移一批函数完全不同"，担心需要把全部读写点改写成
getter/setter 调用（378 处读取 + 125 处直接重新赋值，波及约 500 个
调用点）。M22 重新审视这个假设，结合 M16/M17/M19 已经反复验证过的
一个事实——**classic `<script>` 的顶层 `let`/`const` 声明本身就处于
所有 `<script>` 标签共享的顶层脚本作用域里，跨文件读取和直接重新
赋值都能正常工作，完全不需要改成 getter/setter**——发现"真正拆分
state.js"其实可以用跟前 21 个里程碑完全一样的方式完成：只搬移
**声明的物理位置**，不触碰任何一个调用点。

M22 拆了 `state.js`，包含 6 个核心状态变量：`canvas`/`nodes`/
`selectedId`/`selectedIds`/`selectedImage`/`viewport`。

- **唯一源码分成二十一部分**：新增 `frontend/src/canvas/state.js`
  （M22），排在**全部模块最前面**加载（比 `utils.js` 还早）——这是
  本次拆分唯一需要注意加载顺序的地方：确保所有其它模块和 `main.js`
  在自己的函数体内访问这些变量时（永远晚于页面全部脚本加载完毕），
  它们已经存在。
- **规模确认**：这 6 个变量在全部 19 个已拆分模块 + main.js 里合计
  517 次引用（`nodes` 248 次 / `viewport` 105 次 / `selectedId` 96
  次 / `selectedIds` 68 次），分布在 16 个不同文件里几乎无处不在；
  直接整体重新赋值（`nodes = ...`/`selectedId = ...`/`canvas = ...`）
  的场景也有多处（`main.js` 的 `loadCanvas`/`saveCanvas`、
  `canvas-sync.js` 的 `applyMergedServerCanvas`、`cascade-run.js`
  等）。**一个都没有改动**——本次验证的核心就是确认这些调用点在
  拆分前后完全零改动，物理搬移的只是 6 行声明语句本身的所在文件。
- **验证方式**（这次的验证比前面所有里程碑都更依赖 vm 交叉模拟，
  因为"跨文件变量共享"本身就是唯一的风险点）：先用 grep 确认 19 个
  已拆分模块里没有任何一个在"顶层立即执行的代码"（不在函数体内）
  读取这 6 个变量——这是唯一会让"加载顺序"产生实际影响的场景，确认
  为零之后，物理搬移到哪个位置都是安全的；`node --check` 语法检查；
  git diff 精确确认只删除了 6 行声明语句，替换成注释，其它代码零
  改动；**vm 交叉模拟的关键验证**：用 20 个手写模块 + main.js 按
  生产环境加载顺序在共享上下文里执行一遍后，**直接从 vm 上下文外部
  对 `nodes`/`selectedId` 做一次模拟的"跨文件重新赋值"（`nodes =
  [{id:"test1"}, {id:"test2"}]; selectedId = "test1";`），再调用
  main.js 里真实定义的 `selectedNode()` 函数，确认它正确返回了刚刚
  赋的新值**——这证明了"跨文件读写共享状态"这个核心假设在转换后
  依然成立，不是理论推导，是运行时实测；全量前端 341 测试（新增
  `state.test.js` 7个）+ 后端 4 测试保持全绿。
- **新增测试的一个 Node vm 细节踩坑记录**：`state.test.js` 最初直接
  读取 `sandbox.nodes` 之类的属性做断言，全部失败——原因是 Node
  `vm` 模块 contextify 之后的 sandbox 对象**不会自动反映 `let`/
  `const` 声明的词法绑定**（那些绑定只存在于 vm 上下文的词法环境
  里，不是 sandbox 对象自身的属性），必须始终通过
  `vm.runInContext('nodes', ctx)` 这种表达式求值的方式取值，不能
  直接读 `sandbox.nodes`。这也解释了为什么本次会话所有 vm 交叉模拟
  脚本从 M1 开始就一直用 `vm.runInContext(...)` 而不是直接读 sandbox
  属性——不是随手选的写法，是必须这样才能拿到真实的当前值。
- **效果**：`frontend/src/canvas/main.js` 从 16590 行的单体文件，到
  现在物理拆分出 21 个模块（含 `state.js`），本次会话计划的三大
  高风险区块（`window.onmousemove`/`onmouseup` 物理拆分、顶层匿名
  脚本具名化 + @mention/composer 拆分、`state.js` 真正提取）全部
  完成。

## 仍然搁置的部分

- **画布多端协作合并系统的共享 WebSocket 入口**
  `connectAssetLibrarySyncSocket`——同时分发资产库和画布更新两类
  消息，物理上无法拆分成单一职责模块，这是目前唯一还留在 `main.js`
  里、且明确判断"物理上无法继续拆分"的部分。

## 画布：构建 & 测试

```bash
cd frontend
npm install
npm run build   # 生成 ../static/dist/canvas/{state.js,main.js,utils.js,loop-node.js,node-layout.js,node-model.js,connections.js,cascade-run.js,upload.js,media-display.js,candidate-pool.js,clipboard.js,node-context-ui.js,workflow-transfer.js,canvas-sync.js,prompt-templates.js,mention-composer.js,canvas-render.js,image-editor.js,asset-library.js,generation-settings.js}
npm test        # 跑全部拆分模块的 Vitest 回归测试（三个页面的测试共用一次 npm test）
```

`static/canvas.html` 的加载顺序：
`state.js`（M22，必须最先加载）→ `utils.js` → `loop-node.js` →
`node-layout.js` → `node-model.js` →
`connections.js` → `cascade-run.js` → `upload.js` → `media-display.js` →
`candidate-pool.js` → `clipboard.js` → `node-context-ui.js` →
`workflow-transfer.js` → `canvas-sync.js` → `prompt-templates.js` →
`mention-composer.js` → `canvas-render.js` → `image-editor.js` →
`asset-library.js` → `generation-settings.js` → `main.js`（都是经典
`<script>`，都走 `/static` 挂载和版本号注入逻辑，main.py 不需要任何
改动）。

**重要**：每次修改了 `frontend/src/canvas/main.js` 或
`frontend/src/canvas/` 下任何一个手写模块文件之后，必须重新
运行 `npm run build`，否则 `static/canvas.html` 加载到的会是
旧版本。这个规则对下面 api-settings/asset-manager 两个页面同样适用。

## API 设置页（api-settings）

`static/js/api-settings.js` 用跟画布完全一样的方法论拆分：不改成
ES module（原因见文首），只做"物理搬移函数到独立文件"，状态变量和
真正跨子系统共享的核心逻辑留在 `main.js`。这个页面比画布小得多
（拆分前 2564 行），且拆分前所有顶层函数已经是具名声明（没有 M20 那种
"顶层匿名脚本"问题），所以直接一步做完整拆分，没有分成多个里程碑。

- **拆出 5 个模块**（`frontend/src/api-settings/`，`<script>` 加载顺序
  即下面的列出顺序，全部排在 `main.js` 之前）：
  - `rh-workflow-editor.js`（966 行，约 55 个函数）：RunningHub AI 应用
    配置的整套编辑体验——粘贴 `/run/ai-app/...` 链接创建卡片、卡片
    缩略图上传、工作流字段拉取与归一化、字段编辑弹层、画布节点映射
    预览、"测试运行"整套提交/轮询/取结果逻辑、编辑器滚动位置保持。
    这是本次迁移里最大的单个子系统。
  - `provider-onboarding.js`（162 行，6 个函数）：新用户首次接触
    列表管理（新增/更新/删除一条 LoRA 配置）。
- **留在 `main.js`**（1146 行，55.3% 缩减）：`providers`/`selectedId`
  核心状态、`provider()`/`syncEditor()`/`renderEditor()`/
  `saveProviders()`/`loadProviders()` 供应商 CRUD 核心、模型 CRUD、
  连接测试（`testConnection`/`probeAsync`/`fetchModels`）、模型选择器
  弹层（`openModelPicker` 等）、通用工具（`escapeHtml`/`tr`/`setStatus`/
  `broadcastStudioApiChange` 等）、全部配置常量。
- **内联 `onclick` 依赖的验证**：`api-settings.html` 有 40 处内联
  `onclick`/`onchange` 属性直接引用 window 全局函数（比画布的写法
  更依赖这个机制），拆分后专门用 vm 模拟验证了这些内联属性引用的函数
  （`toggleRhWorkflowEditorField`/`saveOnboardingRunningHubKey`/
  `updateMsLora` 等）在跨文件加载后依然能通过 `typeof fn === 'function'`
  正确解析——经典脚本顶层函数声明自动挂到共享作用域这个机制，在
  多文件场景下同样成立。
- **验证**：语法检查、`git diff` 精确核对删除了 1425 行（RH 模块 933 +
  其余 4 个模块 492，与预期完全一致）、跨文件 grep 确认 0/1 分布、
  vm 交叉模拟验证全部 5 模块 + main.js 加载零 `ReferenceError`、
  341→369 前端测试保持不受影响（新增 28 个：`rh-workflow-editor.test.js`
  23 个 + `ms-lora.test.js` 5 个，覆盖 `parseRunningHubRunRef`/
  `rhWorkflowFieldKind`/`normalizeRhWorkflowField`/`rhEditorSortedFields`/
  `mediaAcceptForRhKind`/`rhPreviewRandomValue`/`normalizeLoraStrength`/
  `msLoraTargetOptions` 等纯逻辑函数）、后端 4 测试不受影响。

## 素材库管理页（asset-manager）

`static/js/asset-manager.js` 同样用跟画布一样的方法论拆分。这是
本次迁移里规模最大的单个文件（拆分前 2715 行，约 150 个函数，67 个
`let` 状态变量）。跟 api-settings 的一个显著区别：这个页面**零内联
事件绑定**，所有交互都走一个巨大的 `handleClick` 委托函数（304 行，
根据 `event.target.closest(...)` 匹配各种 `data-xxx` 属性分发到具体
操作），`handleClick` 本身跟几乎全部子系统都有耦合，判断为"物理上
最好留在 main.js"，跟画布的 `syncEditor`/`renderEditor` 是同一类
角色——核心调度器，不拆。

- **拆出 6 个模块**（`frontend/src/asset-manager/`，`<script>` 加载
  顺序即下面列出顺序）：
  - `storage-manager.js`（331 行，17 个函数）：存储用量总览、分页/
    排序/筛选后的文件列表拉取、批量删除、存储管理面板渲染。
  - `local-assets.js`（387 行，23 个函数）：两个子标签页——"本地上传"
    （用户直接从本机上传的临时素材）+ "本地"（挂载在服务器上的共享
    文件夹浏览），这两者物理上相邻、经常互相调用，合并成一个模块。
  - `asset-library.js`（585 行，29 个函数）：正式资产库（图片/视频等
    媒体素材）的 CRUD——库/分类管理、卡片渲染、上传、剪贴板（含"本地"
    剪贴板到资产库的粘贴桥接，这是本地素材和正式资产库之间唯一的
    桥梁，所以放在这个模块而不是 `local-assets.js`）。这是本次迁移里
    最大的单个子系统。
  - `prompt-library.js`（477 行，17 个函数）：提示词库的 CRUD，跟
    `asset-library.js` 结构对称（库/分类管理、卡片渲染、增删改）。
  - `avatar-registration.js`（199 行，9 个函数 + 2 个常量）：把资产库
    里的图片注册成 AI 供应商的"头像"角色，含异步注册状态轮询。
  - `detail-lightbox.js`（204 行，13 个函数）：两个逻辑独立但物理相邻
    的交互——详情预览灯箱（全屏大图/视频预览，支持拖拽平移和滚轮
    缩放）+ 框选（marquee selection，按住鼠标拖拽画框多选卡片）。
- **留在 `main.js`**（751 行，72.3% 缩减）：全部 67 个状态变量、
  `handleClick`（304 行中央分发）、`render`/`switchTab`/`loadAll`、
  通用工具（`escapeHtml`/`apiJson`/`setStatus`/`refreshIcons`/
  `assetKind`/`assetKindLabel`/`assetThumb`——最后三个虽然像是"资产库
  专属"，但因为被 storage/local/asset-library 等多个子系统共用，判断
  为通用工具留在 main.js，跟 `escapeHtml` 同类）、`renderCanvasAssetsManager`
  （"画布资产"标签页的占位函数，功能待完善，18 行太小不值得单独拆）。
- **一次踩坑记录**：第一次尝试写 `storage-manager.js` 时手写了函数体
  （没有严格从原文件 `sed` 提取），凭记忆重写的 API 请求参数、HTML
  结构和返回值逻辑跟原文件出现了大量不一致，被 byte-diff 完全揪出来，
  只能整个重做。**之后严格执行"header 注释单独写 + `sed` 精确提取到
  临时文件 + `cat` 拼接 + byte-diff 校验"流程，不再手写任何一行函数
  体**，后面 6 个模块全部一次性 byte-diff 通过。这个教训被写进这里
  是为了强调：物理搬移函数体永远应该是机械的复制粘贴操作，凭记忆
  重写等于在没有必要的地方引入了新代码，一旦库/模型/接口细节记错，
  就是一个真实的功能回归。
- **另一次疏漏**：批量删除脚本的 `ranges` 列表一次漏掉了两段（虽然
  已经提取到模块文件，但没有从 `main.js` 里删除，导致这几个函数
  重复定义在两个地方），被跨文件 grep 检查（确认每个函数在全部文件
  里恰好出现 1 次）发现并修复。这也是为什么"交叉 grep 确认 0/1 分布"
  是这套验证流程里不能省略的一步——光靠 `node --check` 语法检查不会
  报错，重复定义在浏览器里也不一定马上出问题（后定义的会覆盖前面的，
  可能表现正常但实际上跑的是脚本里更靠后的那份定义）。
- **`frontend/test/` 目录是所有页面共用的扁平目录，测试文件名需要
  全局唯一**：画布已经有一个 `asset-library.test.js`（M9 模块，
  画布内嵌的资产库面板，跟这次 asset-manager 页面新拆出来的
  `asset-library.js` 是完全不同的两个模块，只是恰好同名）。这次没有
  给 asset-manager 的 `asset-library.js` 写测试文件所以没有实际冲突，
  但未来如果要补测试，需要用带页面前缀的文件名（比如
  `asset-manager-asset-library.test.js`）来避免撞名。
- **验证**：语法检查、`git diff` 精确核对删除了 2031 行 + 插入 67 行
  注释、跨文件 grep 确认全部 154 个函数在 main.js（14 个）+ 6 个模块
  （140 个）之间零重复零遗漏、vm 交叉模拟验证全部 6 模块 + main.js
  加载零 `ReferenceError`（含调用真实函数 `assetLibraries()` 验证跨
  模块状态读取正确）、369→408 前端测试保持不受影响（新增 39 个：
  `storage-manager.test.js` 15 个 + `local-assets.test.js` 15 个 +
  `detail-lightbox.test.js` 9 个，覆盖 `storageUsagePercent`/
  `storagePageInfo`/`isLocalMediaFile`/`localItemKind`/`localFolderTotal`/
  `indexSharedTree`/`rectsIntersect`/`marqueeTargetSelector` 等纯逻辑
  函数）、后端 4 测试不受影响。
- **跳过测试的模块**：`asset-library.js`/`prompt-library.js`/
  `avatar-registration.js`/`provider-onboarding.js`/
  DB-CRUD/网络请求为主（跟画布 M5/M7/M8 核心批次同类不适合单元
  测试）或者过于 trivial（如 `openLocalItem` 就是 `window.open` 一行）。

## ComfyUI 设置页（comfyui-settings）

`static/js/comfyui-settings.js` 同样用一样的方法论拆分（拆分前 1397
行，81 个函数，21 个状态变量，跟 api-settings 类似规模）。这个页面是
"自定义 ComfyUI 工作流 → 生成可视化编辑器"的配置工具：上传原始
ComfyUI workflow JSON，把某些节点输入暴露成可配置字段，在画布节点里
使用。

- **拆出 5 个模块**（`frontend/src/comfyui-settings/`，`<script>`
  加载顺序即下面列出顺序）：
  - `comfy-instances.js`（68 行，6 个函数）：ComfyUI 服务实例管理
    （地址 + 备注的增删改查），页面里唯一跟"工作流编辑"完全解耦的
    独立子系统。
  - `node-graph-editor.js`（276 行，10 个函数）："图编辑模式"下的
    节点关系图可视化——按依赖关系分层布局（`computeLayers`，一个纯粹
    的拓扑排序/图分层算法，读取 ComfyUI workflow JSON 里
    `[nodeId, outputIndex]` 形式的节点间引用关系）、SVG 节点图渲染、
    缩放平移、点击节点弹出参数编辑弹层。
  - `field-editor.js`（224 行，11 个函数）：把工作流某个节点输入
    "暴露"成可配置字段（`toggleField`）、字段类型猜测
    （`guessType`，按字段名关键字/取值类型猜测合理的默认展示类型：
    数字/滑块/文本/长文本/图片/视频/音频）、字段属性编辑、下拉选项
    管理。
  - `preview-panel.js`（154 行，11 个函数）：右侧实时预览面板——每个
    已暴露字段的输入控件渲染、随机数字段支持
    （`randomValueForField`/`fieldSupportsRandom`，数字类字段可以标记
    为"每次运行随机取值"）、图片预览放大弹层。
  - `mini-canvas.js`（272 行，12 个函数）："画布测试"模式下的迷你
    交互式节点图——跟 `node-graph-editor.js` 展示同一份工作流数据，
    但这里是给用户摆放"提示词卡片"/"媒体卡片"、手动连线来快速试跑
    工作流，是跟图编辑模式并列的另一种工作区视图
    （`workspaceMode === 'canvas'`）。
- **留在 `main.js`**（531 行，62% 缩减）：全部 21 个状态变量、i18n
  辅助函数（`tr`/`tf`/`refreshLanguageView`/`applyLanguage`/
  `currentLang`/`typeLabel`）、节点展示文本
  （`nodeLabel`/`nodeSub`/`nodeIcon`/`inputLabel`，跟随
  `NODE_INFO`/`INPUT_LABELS` 常量）、媒体字段通用工具
  （`fieldKind`/`isMediaField`/`mediaFieldLabel`/`mediaAccept`/
  `mediaUploadText`/`mediaUploadFailedText`/`mediaPreviewHtml`——虽然
  像是某个子系统专属，但因为被 field-editor/preview-panel/mini-canvas
  三个模块共用，判断为通用工具留在 main.js）、工作流 CRUD 核心
  （`loadList`/`renderList`/`selectWorkflow`/`updateWorkflowTitle`/
  `setWorkspaceMode`/`renderEditor`/`renderWorkspaceView`/`onUpload`/
  `onSave`/`onDelete`/`onRun`/`fieldsFromMiniCanvas`/`pickImage`——这些
  函数互相调用、共享 `currentWorkflow`/`currentConfig` 核心状态，是
  整个页面的调度中枢，跟 asset-manager 的 `handleClick`、
  api-settings 的 `syncEditor`/`renderEditor` 是同一类角色，判断为
  不拆）。`renderWorkspaceView` 专门确认过是个薄分发函数（只负责按
  `workspaceMode` 切换显示 `renderGraph` 还是
  `renderMiniCanvasPreview`，本身不到 20 行），留在 main.js 而不是
  归入某个具体子系统模块。
- **验证**：语法检查、`git diff` 精确核对删除了约 890 行、跨文件 grep
  确认全部 85 个函数在 main.js（33 个）+ 5 个模块（52 个）之间零重复
  零遗漏、vm 交叉模拟验证全部 5 模块 + main.js 加载零 `ReferenceError`
  （含验证内联 onclick 依赖的跨模块函数如 `toggleField`/`graphZoom`/
  `addMiniNode` 全部可访问）、408→434 前端测试保持不受影响（新增 26
  个：`field-editor.test.js` 9 个（`guessType`/`makeFieldId`/
  `fieldFor`）+ `preview-panel.test.js` 11 个
  （`fieldSupportsRandom`/`isPreviewRandomActive`/`randomValueForField`/
  `randomButtonHtml`）+ `node-graph-editor.test.js` 6 个
  （`computeLayers` 的拓扑分层算法：线性依赖链/多分支合流/孤立节点/
  无效引用/空工作流），后端 4 测试不受影响。
- **跳过测试的模块**：`comfy-instances.js`/`mini-canvas.js` 没有写
  专门的单元测试——前者是纯 CRUD/网络请求，后者的函数基本都依赖真实
  DOM 拖拽事件（`bindMiniCanvas`）或 `currentConfig`/`miniTestNodes`
  状态耦合过深，独立测试价值不高。

## 应用外壳（index）

`static/index.html` 是承载全部其它页面的"外壳"——每个功能页面（画布/
API 设置/素材库/ComfyUI 设置等）都以 `<iframe>` 形式挂载在这个页面
里，侧边栏导航负责切换哪个 iframe 是 active。这跟前四次迁移的性质
不同：前四次是**独立页面**，出问题最多影响那一个页面；这次是**全局
外壳**，出问题可能影响整个应用的导航——所以这次额外做了更谨慎的
风险分级，只搬移了两类低风险内容，核心调度逻辑（`switchUI`）刻意
不拆。

**这是本次会话第一次把"内联 `<script>`"变成独立外部文件**——前四个
页面本来就已经是外部 `.js` 文件，这次是先把 `static/index.html` 内联
的 800 行主脚本块 + 40 行独立的版本检测脚本块，原样搬到新建的
`static/js/index.js`，再套用同一套模块拆分方法论。

- **拆出 3 个模块**（`frontend/src/index/`）：
  - `help-feedback.js`（491 行）：帮助面板 + 反馈组件 + 系统公告，
    三块物理相邻。其中反馈组件（`initFeedbackWidget`）和帮助面板
    （`initHelpDrawer`，含一个手写的极简 Markdown 渲染器
    `renderMarkdown`，不依赖第三方库）**本来就是用 IIFE 包裹的**
    （`(function xxx(){...})()`，原作者的写法，不是本次迁移引入的）
    ——这是这次会话里风险最低的一类拆分：整个 IIFE 作为不可分割的
    单元物理搬移，内部实现一行不改。系统公告部分
    （`showAnnouncementModal` 等）不在 IIFE 里，但同样只依赖
    DOM/localStorage，没有跨模块状态耦合。
  - `theme-lang-sync.js`（108 行）：外壳自身的主题/语言切换按钮 +
    把切换结果广播给全部子页面 iframe（`broadcastTheme`/
    `broadcastLanguage`，通过 `postMessage` 通知每个 iframe）。
  - `version-check.js`（61 行）：定期轮询 `/api/version`，检测到不
    兼容更新时展示强制刷新弹窗，检测到补丁更新时展示可关闭提示条。
    本来就是一个完全独立自包含的 IIFE，跟主体代码零函数级依赖，只
    共享两个 DOM 元素 id——是这次拆分里耦合度最低的一块。
- **留在 `static/js/index.js`**（300 行）：唯一客户端 id 生成
  （`generateUUID`/`CID`）、侧边栏固定/收起状态、本地功能分组折叠
  状态、**核心的 iframe 切换调度 `switchUI`**（处理"离开确认"页面
  守卫消息、通知被切走的页面、切换 active 类名、恢复本地导航折叠
  状态——这是整个外壳唯一真正意义上的调度中枢，跟 asset-manager 的
  `handleClick`、api-settings 的 `syncEditor`/`renderEditor` 是完全
  相同的角色，判断为不拆）、跨 iframe 广播供应商/工作流变更消息
  （`forwardStudioApiChange`）、刷新后恢复上次激活页面
  （`restoreActivePage`）、按用户权限裁剪侧边栏入口
  （`applyAccessControl`）、到 `/ws/stats` 的 WebSocket 连接（在线
  人数/云端状态/画布更新/资产库更新等消息的接收和跨 iframe 转发）。
- **跨模块桥接**：`initHelpDrawer` IIFE 内部有一行
  `window.closeHelpDrawer = closeHelp;`（显式挂到 window，因为
  `closeHelp` 本身是 IIFE 私有作用域函数，只能这样才能被外部访问）
  ——main.js 保留的 `switchUI` 切换页面时会调用
  `window.closeHelpDrawer()` 收起帮助面板。这行代码原样保留未改动，
  vm 交叉模拟专门验证过这个桥接在物理拆分成不同文件后依然工作
  正常（`typeof window.closeHelpDrawer === 'function'`）。
- **本次迁移顺带修复的一个既存 bug**：`toggleLanguage()` 原来还调用
  了三个全项目里都没有定义的函数——`updateProjectUpdateTitle()`/
  `refreshUpdateButtonText()`/`refreshProjectUpdateModalText()`（应该
  是某个"检测项目更新"相关功能被删除后遗留的死代码引用）。每次点击
  语言切换按钮都会在语言实际切换成功之后抛出 `ReferenceError`（语言
  切换本身不受影响，因为崩溃前的代码已经执行完，但控制台会有一个
  未捕获异常）。这跟模块拆分无关，是读代码时顺带发现并清理的，删除
  前明确跟用户确认过。
- **验证**：语法检查、`git diff` 精确核对 `static/index.html` 删除了
  840 行、vm 交叉模拟验证 2 个模块 + main.js 加载零 `ReferenceError`
  （含专门验证 `window.closeHelpDrawer` 跨文件桥接、内联 onclick
  依赖的 `switchUI`/`toggleTheme`/`toggleLanguage` 等函数全部可访问）、
  `version-check.js` 独立验证零依赖加载、434 前端测试 + 4 后端测试
  保持不受影响（本次没有新增单元测试——`help-feedback.js`/
  `theme-lang-sync.js`/`version-check.js` 的可测函数基本都被 IIFE
  私有作用域包裹，不修改源码结构就无法从外部访问，判断为不值得为了
  测试而改变现有的封装设计）。
- **一次真实的事故记录（HTML 文件损坏，已修复）**：用 Python 脚本
  批量删除两处区间（版本检测脚本块 + 主脚本块）并插入替换内容时，
  文件末尾残留了一段孤立的旧代码片段（从 `else {` 的后半段
  `lse {` 开始，一直到重复的 `})();`/`</script>`/`</body>`/`</html>`），
  导致 `<script>`/`</script>` 标签数量不匹配（12 开 13 闭）、
  `</body>`/`</html>` 各出现了两次。这是本次会话第一次在 **HTML 文件**
  （而不是纯 JS 文件）上做批量区间删除，而 HTML 文件的收尾标签
  （`</body></html>`）离最后一个删除区间非常近，一旦删除区间的边界
  计算有任何偏差，残留的尾部内容会跟收尾标签"重叠"从而不容易通过
  单纯看 diff 摘要发现（`git diff --stat` 的行数统计当时看起来正常，
  真正暴露问题的是显式检查 `<script>`/`</script>`/`</body>`/`</html>`
  这几个标签的出现次数是否配对——这是本次事故里最终用来定位问题的
  方法，后续在 HTML 文件上做批量删除时会预先做这个检查，不能只看
  `git diff --stat` 的行数摘要）。修复方式是直接删除残留片段。这次
  事故发生在 vm 交叉模拟（验证的是拆出去的 3 个 JS 模块本身，不检查
  `index.html` 的 HTML 结构）已经全部通过之后，说明"JS 模块本身没问题"
  和"HTML 引用它们的宿主文件没有被搞坏"是两件需要分别验证的事，缺一
  不可。

## 五个页面共用的构建流程

```bash
cd frontend
npm install
npm run build   # 一次性构建全部五个页面（canvas + api-settings + asset-manager + comfyui-settings + index）
npm test        # 跑全部五个页面的 Vitest 回归测试
```

`frontend/scripts/build-pages.mjs` 是通用的多页面构建脚本（取代了
早期只认识画布一个页面的 `build-canvas.mjs`），内部维护一份
`PAGES` 注册表，每个页面登记 `page`（对应 `frontend/src/<page>/` 和
`static/dist/<page>/`）、`mainSrc`（该页面唯一源码在 `static/js/` 下的
路径）、`handwrittenFiles`（已拆分模块的文件名列表，顺序即
`<script src>` 加载顺序）。新增一个页面只需要往这个注册表加一条配置。

`static/api-settings.html`、`static/asset-manager.html`、
`static/comfyui-settings.html`、`static/index.html` 的 `<script>` 标签
已经从直接指向 `/static/js/<page>.js` 改成指向
`/static/dist/<page>/main.js` + 各拆分模块——**这意味着这几个页面
现在也需要先跑 `npm run build` 才能生效**，跟画布的规则完全一致。
如果只改了 `static/js/api-settings.js`/`static/js/asset-manager.js`/
`static/js/comfyui-settings.js`/`static/js/index.js`，忘记
`npm run build`，页面加载到的会是旧版本代码。


