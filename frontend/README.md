# frontend/

智能画布（`static/js/smart-canvas.js`）前端重构的源码目录，对应
`docs/前端重构计划.md`。

## 当前状态：M2（部分完成，同 M1 的范围原则）

M2 原计划是拆 `loop-node.js` + 建立布局快照测试。已完成，但沿用 M1 的
经典脚本方案（原因见下方），且严格排除了跟级联执行调度耦合的函数。

- **唯一源码分成三部分**：
  - `static/js/smart-canvas.js`：主体代码，改动依然很频繁。
  - `frontend/src/smart-canvas/utils.js`：M1 拆出的 7 个无状态工具函数。
  - `frontend/src/smart-canvas/loop-node.js`：M2 拆出的循环节点
    （`smart-loop`）专属逻辑，约 30 个函数/常量，包括
    `smartLoopCount`/`smartLoopWidth`/`smartLoopHeight`/`fitSmartLoopNode`/
    `createLoopNode`/循环节点 UI 渲染与绑定（`smartLoopBodyHtml`/
    `bindLoopNodeControls`/`loopNumberControlHtml` 等）/循环提示词字段
    读写（`smartLoopPromptFieldValues` 等）/循环输入图片切片
    （`smartLoopInputImages`/`smartLoopTotalInputImages`/
    `smartLoopPreviewImages`）/循环链路克隆
    （`collectLoopChainSubgraph`/`cloneLoopChainForRound`）。
- **同样不是真正的 ES module**：原因跟 `utils.js` 完全一致——一旦用
  `export`/`import`，`smart-canvas.js` 就要整体转 `type="module"`，
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
  - `static/js/smart-canvas.js`：主体代码，改动依然很频繁。
  - `frontend/src/smart-canvas/utils.js`（M1）：7 个无状态工具函数。
  - `frontend/src/smart-canvas/loop-node.js`（M2）：循环节点专属逻辑。
  - `frontend/src/smart-canvas/node-layout.js`（M3）：节点布局计算，
    包括 `safeScale`/`nodeScale`/`mediaNodeDefaultScale`/
    `smartGroupLayoutSize`/`smartGroupThumbLayout`/`singleImageLayout`/
    `groupImageGridLayout`/`smartNodeInputThumbRows`/
    `smartNodeInputThumbsHeight`/`smartNodeInputThumbsHtml`/
    `promptNodeLayoutSize`/`imageLayout`/`nodeRect`。
  - `frontend/src/smart-canvas/node-model.js`（M3）：节点数据模型的
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
  - `static/js/smart-canvas.js`：主体代码，改动依然很频繁。
  - `frontend/src/smart-canvas/utils.js`（M1）。
  - `frontend/src/smart-canvas/loop-node.js`（M2）。
  - `frontend/src/smart-canvas/node-layout.js` + `node-model.js`（M3）。
  - `frontend/src/smart-canvas/connections.js`（M4）：连线数据操作
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
  - `static/js/smart-canvas.js`：主体代码，改动依然很频繁。
  - `frontend/src/smart-canvas/{utils,loop-node,node-layout,node-model,connections}.js`
    （M1-M4）。
  - `frontend/src/smart-canvas/cascade-run.js`（M5）：共 32 个函数，
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
      `runModelscopeGeneration`/`urlToBase64`）。这批函数在原文件里物理
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
  - `static/js/smart-canvas.js`：主体代码，改动依然很频繁。
  - `frontend/src/smart-canvas/{utils,loop-node,node-layout,node-model,connections,cascade-run}.js`
    （M1-M5）。
  - `frontend/src/smart-canvas/upload.js`（M6）：拖拽数据解析
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
  另外发现 `frontend/src/smart-canvas/upload.js` 里 `hasSmartAssetDrag`
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
  `frontend/src/smart-canvas/canvas-render.js`（M7），排在 `upload.js`
  之后、`main.js` 之前加载。包含两类函数：
  - 节点卡片 HTML 构建：`smartGroupBodyHtml`/`jimengPendingBodyHtml`/
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
  `frontend/src/smart-canvas/image-editor.js`（M8），排在
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
  `frontend/src/smart-canvas/asset-library.js`（M9），排在
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
    smart-canvas 多人协作用的**唯一** WebSocket 连接，`onmessage` 里
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
  `frontend/src/smart-canvas/generation-settings.js`（M10），排在
  `asset-library.js` 之后、`main.js` 之前加载。物理上是连续的一整块
  （原文件 1753-3365 行区间），覆盖：
  1. 引擎/模型可用性判断：`syncEngineOptionsVisibility`/
     `runningHubStandardImageModels`/`smartModelAllowed`/
     `providerHasAllowedImageModel`/`imageProviders`/`volcengineProvider`/
     `runningHubProvider` 等。
  2. RunningHub 工作流字段解析与渲染：`rhFieldKind`/`rhFieldRole`/
     `rhExtractFieldOptions`/`rhDefaultValue`/`rhParamValue`/
     `renderRhSettingField`/`renderRhConfigControl` 等。
  3. 即梦（Jimeng）模型/视频指令过滤：`filterJimengImageModels`/
     `filterJimengVideoModels`/`jimengImageEditMode`/`jimengVideoCommand`
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
  `frontend/src/smart-canvas/media-display.js`（M11）。这是本文件里
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
  `frontend/src/smart-canvas/candidate-pool.js`（M12），排在
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
  `frontend/src/smart-canvas/clipboard.js`（M13），排在
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
  `frontend/src/smart-canvas/node-context-ui.js`（M14），排在
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
  `frontend/src/smart-canvas/workflow-transfer.js`（M15），排在
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
等 10 个常量声明，导致打开已有画布时卡在"正在载入智能画布"，详见
下方"线上事故复盘"一节）之后，继续评估剩余候选。M9 阶段的架构备注
里提到"画布多端协作合并系统"是一个尚未拆出的独立子系统（当时因为
物理上和 asset-library.js 交叠而搁置），现在单独评估发现它是一块
自洽的、不涉及顶层匿名脚本的区域，适合作为下一个拆分目标。

M16 拆了 `canvas-sync.js`，共10个函数。

- **唯一源码分成十八部分**：新增
  `frontend/src/smart-canvas/canvas-sync.js`（M16），排在
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

打开一个此前已存在的画布时，页面卡在"正在载入智能画布"加载动画
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
删除 `static/js/smart-canvas.js` 里的函数区间时，连带把这 10 行
常量声明一起删掉了，且从未补回任何地方，变成了"哪个文件都没有
声明"。因为这些常量只在函数体内部被引用（不是模块顶层立即执行的
代码），所以当时的 10 步校验流程里的"语法检查"/"vm 交叉模拟"都没
测出来（vm 模拟的 sandbox 里手动 stub 了这些常量，反而掩盖了问题）；
真正会用到这些常量的路径（渲染一个已有节点的画布）也没有被 M1-M15
任何一个模块的单元测试覆盖到，因为那些测试都是用手造的最小化输入
调用纯函数，不会经过"渲染整个画布"的完整调用链。

**修复**：把这 10 个常量声明原样补回 `static/js/smart-canvas.js`
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
  `frontend/src/smart-canvas/prompt-templates.js`（M17），排在
  `canvas-sync.js` 之后、`canvas-render.js` 之前加载。覆盖提示词预设
  （个人保存的提示词片段）和提示词模板库（内置模板 + 远程模板库）的
  完整生命周期：
  1. 本地存储读写：`loadPromptPresets`/`savePromptPresets`/
     `loadPromptTemplateGroups`/`savePromptTemplateGroups`/
     `loadPromptTemplateOverrides`/`savePromptTemplateOverrides`。
  2. 模板库加载与选择：`loadPromptTemplates`（从 `/api/prompt-libraries`
     加载，远程库为空时兜底到旧版 `/api/smart-canvas/prompt-templates`）/
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

## 仍然搁置的部分

- **`state.js`**（`nodes`/`viewport`/`selectedId`/`selectedIds` 等核心全局
  状态）依然没有拆出来。原因跟 M1 阶段分析的一样：这几个变量在
  `main.js` 里有 378 处读取 + 125 处直接重新赋值，真要拆成独立文件需要
  改写成 getter/setter，波及约 500 处调用点，风险量级和"物理搬移一批
  函数"完全不同。目前 `loop-node.js` 依然是通过共享全局作用域直接读写
  `nodes`/`selectedId`（不是 import 进来的），跟 `main.js` 里剩余代码的
  访问方式一致。
- **@mention/composer 核心系统**（`buildPromptRequest`/
  `renderMentionPicker`/输入引用图片收集等）——和图片生成流程的输入
  合成器深度耦合，且和顶层匿名脚本（画布事件绑定/app 启动序列）交织，
  仍是未来更高风险的拆分目标。
- **`window.onmousemove`/`window.onmouseup` 的物理拆分**——M18 已经把
  这两个函数从匿名箭头函数改成了具名函数声明（`handleWindowMouseMove`/
  `handleWindowMouseUp`，现在能被 AST 工具正确识别），但**函数体本身
  仍留在 `main.js`**，没有物理搬移到 `canvas-render.js`。原因：内部
  编排 10+ 种互斥的交互状态（拖拽/平移/裁剪/端口拖线/框选/预览对比/
  全景/缩略图拖拽），依赖至少15个跨函数共享读写的可变状态变量，密度
  明显高于 M16/M17 已经安全拆过的模块，物理搬移的收益不足以覆盖新增
  风险，暂不拆分（具名化本身已经是这次的成果，为未来真要拆分铺好了
  最基础的一步）。
- **画布多端协作合并系统的共享 WebSocket 入口**
  `connectAssetLibrarySyncSocket`——同时分发资产库和画布更新两类
  消息，物理上无法拆分成单一职责模块。

## 构建 & 测试

```bash
cd frontend
npm install
npm run build   # 生成 ../static/dist/smart-canvas/{main.js,utils.js,loop-node.js,node-layout.js,node-model.js,connections.js,cascade-run.js,upload.js,media-display.js,candidate-pool.js,clipboard.js,node-context-ui.js,workflow-transfer.js,canvas-sync.js,prompt-templates.js,canvas-render.js,image-editor.js,asset-library.js,generation-settings.js}
npm test        # 跑全部拆分模块的 Vitest 回归测试
```

`static/smart-canvas.html` 的加载顺序：
`utils.js` → `loop-node.js` → `node-layout.js` → `node-model.js` →
`connections.js` → `cascade-run.js` → `upload.js` → `media-display.js` →
`candidate-pool.js` → `clipboard.js` → `node-context-ui.js` →
`workflow-transfer.js` → `canvas-sync.js` → `prompt-templates.js` →
`canvas-render.js` → `image-editor.js` → `asset-library.js` →
`generation-settings.js` → `main.js`（都是经典
`<script>`，都走 `/static` 挂载和版本号注入逻辑，main.py 不需要任何
改动）。

**重要**：每次修改了 `static/js/smart-canvas.js` 或
`frontend/src/smart-canvas/` 下任何一个手写模块文件之后，必须重新
运行 `npm run build`，否则 `static/smart-canvas.html` 加载到的会是
旧版本。



