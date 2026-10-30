// generation-settings.js 回归测试（M10）。
//
// 覆盖范围：
//   1. gcdInt：最大公约数计算（用于化简图片宽高比）。
//   2. imageSizeForRatio：从图片对象提取宽高（兼容多种字段名）。
//   3. reducedRatioForImage：图片宽高化简为最简比例。
//   4. closestStandardRatioKey：按宽高比匹配最接近的标准比例档位。
//   5. parseRatioValue / parseSizeValue：解析用户输入的比例/尺寸字符串。
//   6. ratioIconClass / videoAspectIconClass：比例值到图标 class 的映射。
//   7. ratioLabel：当前设置下的比例展示文案。
//
// renderDynamicParams/bindDynamicParams/loadConfig 等核心函数强依赖真实
// DOM 与网络请求，跟 M5/M7/M8 核心批次一样不适合单元测试，不在本文件
// 覆盖范围内。
import vm from 'node:vm';
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createGenerationSettingsSandbox } from './generation-settings-sandbox.js';

describe('gcdInt', () => {
    it('计算两个正整数的最大公约数', () => {
        const { gcdInt } = createGenerationSettingsSandbox();
        expect(gcdInt(1920, 1080)).toBe(120);
        expect(gcdInt(16, 9)).toBe(1);
        expect(gcdInt(100, 50)).toBe(50);
    });

    it('输入 0 或非法值时至少返回 1', () => {
        const { gcdInt } = createGenerationSettingsSandbox();
        expect(gcdInt(0, 0)).toBe(1);
        expect(gcdInt(NaN, 5)).toBe(5);
    });

    it('负数按绝对值计算', () => {
        const { gcdInt } = createGenerationSettingsSandbox();
        expect(gcdInt(-12, 8)).toBe(4);
    });
});

describe('workflow media filtering', () => {
    it('图片和视频节点只匹配各自类型，通用工作流节点不筛选', () => {
        const { workflowMatchesNode } = createGenerationSettingsSandbox();
        const imageWorkflow = { name: 'image.json', media: 'image' };
        const videoWorkflow = { name: 'video.json', media: 'video' };

        expect(workflowMatchesNode(imageWorkflow, { genKind: 'image' })).toBe(true);
        expect(workflowMatchesNode(videoWorkflow, { genKind: 'image' })).toBe(false);
        expect(workflowMatchesNode(videoWorkflow, { genKind: 'video' })).toBe(true);
        expect(workflowMatchesNode(imageWorkflow, { genKind: 'video' })).toBe(false);
        expect(workflowMatchesNode(videoWorkflow, { genKind: 'workflow' })).toBe(true);
    });

    it('未标注 media 的旧工作流按图片兼容', () => {
        const { workflowMediaType, workflowMatchesNode } = createGenerationSettingsSandbox();
        const legacyWorkflow = { name: 'legacy.json' };

        expect(workflowMediaType(legacyWorkflow)).toBe('image');
        expect(workflowMatchesNode(legacyWorkflow, { genKind: 'image' })).toBe(true);
        expect(workflowMatchesNode(legacyWorkflow, { genKind: 'video' })).toBe(false);
    });

    it('没有 media 的 RunningHub 视频工作流可从字段和标签识别', () => {
        const { workflowMediaType } = createGenerationSettingsSandbox();

        expect(workflowMediaType({ fields: [{ fieldType: 'VIDEO' }] })).toBe('video');
        expect(workflowMediaType({ raw: { tags: [{ name: '视频生视频' }] } })).toBe('video');
        expect(workflowMediaType({ raw: { tags: [{ nameEn: 'Video-to-Video' }] } })).toBe('video');
    });

    it('已保存的错误类型工作流会回退到当前节点类型的首项', () => {
        const imageSandbox = createGenerationSettingsSandbox({
            settings: { engine: 'comfy', comfyWorkflow: 'video.json' },
            comfyWorkflows: [
                { name: 'image.json', media: 'image' },
                { name: 'video.json', media: 'video' },
            ],
        });
        imageSandbox.normalizeWorkflowSourceForNode({ genKind: 'image' });
        expect(imageSandbox.__state.settings.comfyWorkflow).toBe('image.json');

        const videoSandbox = createGenerationSettingsSandbox({
            settings: { engine: 'comfy', comfyWorkflow: 'image.json' },
            comfyWorkflows: [
                { name: 'image.json', media: 'image' },
                { name: 'video.json', media: 'video' },
            ],
        });
        videoSandbox.normalizeWorkflowSourceForNode({ genKind: 'video' });
        expect(videoSandbox.__state.settings.comfyWorkflow).toBe('video.json');
    });

    it('RunningHub 旧连接条目从资源配置补齐媒体类型', () => {
        const { runningHubEntries } = createGenerationSettingsSandbox({
            aiConnections: [{
                id: 'runninghub',
                enabled: true,
                rh_apps: [{ id: 'video-app', title: 'Video app' }],
            }],
            aiResourceIndex: {
                resources: [{
                    id: 'resource-video-app',
                    kind: 'runninghub_app',
                    enabled: true,
                    settings: { id: 'video-app', media: 'video' },
                }],
            },
        });

        expect(runningHubEntries('app')).toMatchObject([{ id: 'video-app', media: 'video' }]);
    });
});

describe('RunningHub text parameters', () => {
    it('保留多段提示词和空行，只统一换行符', () => {
        const { normalizeRhTextValue } = createGenerationSettingsSandbox();
        expect(normalizeRhTextValue('第一段\r\n\r\n第二段\r第三段')).toBe('第一段\n\n第二段\n第三段');
    });
});

describe('canonical workflow selection', () => {
    const resources = [{id:'d-resource',kind:'runninghub_app',name:'D风格文生图',settings:{app_id:'d-app',fields:[{fieldName:'prompt'}]}}];
    const aiConnections = [{id:'runninghub',rh_apps:[{id:'first-app',title:'默认工作流'},{id:'d-app',title:'D风格文生图'}]}];

    it('从确认的资源恢复 RunningHub 引擎及选择，不使用首个工作流', () => {
        const ctx=createGenerationSettingsSandbox({settings:{engine:'comfy',resource_id:'d-resource',comfyWorkflow:'Sam3DBody.json'},aiConnections,aiResourceIndex:{resources}});
        ctx.normalizeWorkflowSourceForNode({genKind:'workflow'});
        expect(ctx.__state.settings.engine).toBe('runninghub');
        expect(ctx.__state.settings.rhConfigKey).toBe('app:d-app');
        expect(ctx.selectedRunningHubRef().id).toBe('d-app');
    });

    it('直接运行未打开配置的节点时也按资源 ID 找到已确认工作流', () => {
        const ctx=createGenerationSettingsSandbox({aiConnections,aiResourceIndex:{resources}});
        expect(ctx.selectedRunningHubRef({resource_id:'d-resource'}).id).toBe('d-app');
    });

    it('节点的资源选择优先于画布默认工作流', () => {
        const ctx=createGenerationSettingsSandbox({aiConnections,aiResourceIndex:{resources}});
        Object.assign(ctx,{
            normalizeStoredImageRatios:value=>value,
            stripOutpaintDisplaySettings:value=>JSON.parse(JSON.stringify(value)),
            cloneSmartSettings:value=>({...value}),
            recentSmartSettingsForMode:()=>({}),
            canvasDefaultSmartSettings:{engine:'comfy',comfyWorkflow:'Sam3DBody.json',rhConfigKey:'app:first-app'},
            withOutpaintDisplaySettings:(_,value)=>value,
            isApiLikeEngine:engine=>engine==='api',
        });
        const main=fs.readFileSync(new URL('../src/canvas/main.js',import.meta.url),'utf8');
        vm.runInContext(main.slice(main.indexOf('function smartSettingsForNode('),main.indexOf('function activeSettingsSubject(')),ctx);
        const result=ctx.smartSettingsForNode({genKind:'workflow',runSettings:{resource_id:'d-resource',engine:'runninghub',rhInstanceType:'plus',rhParams:{seed:{value:123}}}});
        expect(result).toMatchObject({engine:'runninghub',rhConfigKey:'app:d-app',rhInstanceType:'plus',rhParams:{seed:{value:123}}});
    });

    it('保留用户主动切换的工作流选项', () => {
        const ctx=createGenerationSettingsSandbox({settings:{engine:'runninghub',resource_id:'d-resource',rhConfigKey:'app:first-app'},aiConnections,aiResourceIndex:{resources}});
        ctx.normalizeWorkflowSourceForNode({genKind:'workflow'});
        expect(ctx.selectedRunningHubRef().id).toBe('first-app');
    });

    it('从托管 ComfyUI 资源恢复原工作流名称', () => {
        const ctx=createGenerationSettingsSandbox({settings:{engine:'api',resource_id:'comfy-resource'},aiResourceIndex:{resources:[{id:'comfy-resource',kind:'comfyui_workflow',name:'D-style.json'}]}});
        ctx.normalizeWorkflowSourceForNode({genKind:'workflow'});
        expect(ctx.__state.settings).toMatchObject({engine:'comfy',comfyWorkflow:'D-style.json'});
    });
});

describe('imageSizeForRatio', () => {
    it('兼容 natural_w/natural_h 字段', () => {
        const { imageSizeForRatio } = createGenerationSettingsSandbox();
        expect(imageSizeForRatio({ natural_w: 1920, natural_h: 1080 })).toEqual({ w: 1920, h: 1080 });
    });

    it('兼容 width/height 字段', () => {
        const { imageSizeForRatio } = createGenerationSettingsSandbox();
        expect(imageSizeForRatio({ width: 800, height: 600 })).toEqual({ w: 800, h: 600 });
    });

    it('兼容 w/h 字段', () => {
        const { imageSizeForRatio } = createGenerationSettingsSandbox();
        expect(imageSizeForRatio({ w: 400, h: 300 })).toEqual({ w: 400, h: 300 });
    });

    it('缺少尺寸信息时返回 null', () => {
        const { imageSizeForRatio } = createGenerationSettingsSandbox();
        expect(imageSizeForRatio({})).toBe(null);
        expect(imageSizeForRatio(null)).toBe(null);
    });
});

describe('reducedRatioForImage', () => {
    it('化简为最简整数比', () => {
        const { reducedRatioForImage } = createGenerationSettingsSandbox();
        expect(reducedRatioForImage({ natural_w: 1920, natural_h: 1080 })).toEqual({ w: 16, h: 9 });
        expect(reducedRatioForImage({ natural_w: 800, natural_h: 600 })).toEqual({ w: 4, h: 3 });
    });

    it('图片没有尺寸信息时返回 null', () => {
        const { reducedRatioForImage } = createGenerationSettingsSandbox();
        expect(reducedRatioForImage({})).toBe(null);
    });
});

describe('closestStandardRatioKey', () => {
    it('精确匹配标准比例', () => {
        const { closestStandardRatioKey } = createGenerationSettingsSandbox();
        expect(closestStandardRatioKey(1024, 1024)).toBe('1:1');
        expect(closestStandardRatioKey(1920, 1080)).toBe('16:9');
        expect(closestStandardRatioKey(1080, 1920)).toBe('9:16');
        expect(closestStandardRatioKey(2, 3)).toBe('2:3');
        expect(closestStandardRatioKey(3, 2)).toBe('3:2');
    });

    it('非标准比例匹配最接近的档位', () => {
        const { closestStandardRatioKey } = createGenerationSettingsSandbox();
        // 略偏离 1:1 但仍最接近 1:1。
        expect(closestStandardRatioKey(1000, 1010)).toBe('1:1');
    });

    it('宽高为 0 或非法值时返回 1:1', () => {
        const { closestStandardRatioKey } = createGenerationSettingsSandbox();
        expect(closestStandardRatioKey(0, 100)).toBe('1:1');
        expect(closestStandardRatioKey(100, 0)).toBe('1:1');
    });
});

describe('parseRatioValue', () => {
    it('解析 "宽:高" 格式', () => {
        const { parseRatioValue } = createGenerationSettingsSandbox();
        expect(parseRatioValue('16:9')).toBeCloseTo(16 / 9);
        expect(parseRatioValue('1:1')).toBe(1);
    });

    it('解析 "宽x高"/"宽X高"/"宽*高" 格式', () => {
        const { parseRatioValue } = createGenerationSettingsSandbox();
        expect(parseRatioValue('16x9')).toBeCloseTo(16 / 9);
        expect(parseRatioValue('16X9')).toBeCloseTo(16 / 9);
        expect(parseRatioValue('16*9')).toBeCloseTo(16 / 9);
    });

    it('无法解析或非正数时返回 0', () => {
        const { parseRatioValue } = createGenerationSettingsSandbox();
        expect(parseRatioValue('')).toBe(0);
        expect(parseRatioValue('abc')).toBe(0);
        expect(parseRatioValue('16:9:1')).toBe(0);
        expect(parseRatioValue('-1:9')).toBe(0);
    });
});

describe('parseSizeValue', () => {
    it('解析 "宽x高" 格式的尺寸字符串', () => {
        const { parseSizeValue } = createGenerationSettingsSandbox();
        expect(parseSizeValue('1024x768')).toEqual({ width: '1024', height: '768' });
        expect(parseSizeValue('1024X768')).toEqual({ width: '1024', height: '768' });
        expect(parseSizeValue('1024*768')).toEqual({ width: '1024', height: '768' });
        expect(parseSizeValue(' 1024 x 768 ')).toEqual({ width: '1024', height: '768' });
    });

    it('无法解析时返回 null', () => {
        const { parseSizeValue } = createGenerationSettingsSandbox();
        expect(parseSizeValue('')).toBe(null);
        expect(parseSizeValue('16:9')).toBe(null);
        expect(parseSizeValue('abc')).toBe(null);
    });
});

describe('ratioIconClass', () => {
    it('按比例值映射到对应图标 class', () => {
        const { ratioIconClass } = createGenerationSettingsSandbox();
        expect(ratioIconClass('2:3')).toBe('r-portrait');
        expect(ratioIconClass('3:4')).toBe('r-portrait43');
        expect(ratioIconClass('3:2')).toBe('r-landscape');
        expect(ratioIconClass('4:3')).toBe('r-landscape43');
        expect(ratioIconClass('16:9')).toBe('r-wide');
        expect(ratioIconClass('21:9')).toBe('r-wide');
        expect(ratioIconClass('9:16')).toBe('r-story');
        expect(ratioIconClass('9:21')).toBe('r-story');
        expect(ratioIconClass('source')).toBe('r-source');
        expect(ratioIconClass('custom')).toBe('r-custom');
    });

    it('未知值返回空字符串', () => {
        const { ratioIconClass } = createGenerationSettingsSandbox();
        expect(ratioIconClass('unknown')).toBe('');
        expect(ratioIconClass('square')).toBe('');
    });
});

describe('videoAspectIconClass', () => {
    it('按视频比例文案映射到对应图标 class', () => {
        const { videoAspectIconClass } = createGenerationSettingsSandbox();
        expect(videoAspectIconClass('16:9')).toBe('r-wide');
        expect(videoAspectIconClass('21:9')).toBe('r-wide');
        expect(videoAspectIconClass('9:16')).toBe('r-story');
        expect(videoAspectIconClass('9:21')).toBe('r-story');
        expect(videoAspectIconClass('4:3')).toBe('r-landscape43');
        expect(videoAspectIconClass('3:4')).toBe('r-portrait43');
        expect(videoAspectIconClass('keep_ratio')).toBe('r-source');
        expect(videoAspectIconClass('adaptive')).toBe('r-source');
    });

    it('未知值返回空字符串', () => {
        const { videoAspectIconClass } = createGenerationSettingsSandbox();
        expect(videoAspectIconClass('1:1')).toBe('');
    });
});

describe('ratioLabel', () => {
    it('按 settings.ratio 映射到展示文案（默认 1:1）', () => {
        const { ratioLabel } = createGenerationSettingsSandbox({ settings: {} });
        expect(ratioLabel()).toBe('1:1');
    });

    it('按 prefix 读取对应字段（如 outpaintRatio）', () => {
        const { ratioLabel } = createGenerationSettingsSandbox({
            settings: { outpaintRatio: '16:9' },
        });
        expect(ratioLabel('outpaint')).toBe('16:9');
    });

    it('custom 比例使用 customRatio 字段的值', () => {
        const { ratioLabel } = createGenerationSettingsSandbox({
            settings: { ratio: 'custom', customRatio: '5:7' },
        });
        expect(ratioLabel()).toBe('5:7');
    });
});


describe('RunningHub request parameters', () => {
    const fields = [
        { nodeId: '1', fieldName: 'image', fieldType: 'IMAGE', fieldValue: 'default.png', enabled: true },
        { nodeId: '2', fieldName: 'text', fieldType: 'PROMPT', fieldValue: '默认提示词', enabled: true },
        { nodeId: '3', fieldName: 'steps', fieldType: 'INT', fieldValue: '20', enabled: true },
        { nodeId: '3', fieldName: 'seed', fieldType: 'INT', fieldValue: '12345', enabled: false },
        { nodeId: '4', fieldName: 'negative', fieldType: 'STRING', fieldValue: 'blurry\r\nlow quality', enabled: false },
        { nodeId: '5', fieldName: 'hires', fieldType: 'BOOLEAN', fieldValue: 'false', enabled: false },
    ];
    // The selected-app lookup needs the whole settings/connection graph; stub it
    // so the request builder is tested in isolation.
    const setup = (entryFields = fields, params = {}) => {
        const ctx = createGenerationSettingsSandbox({ settings: { rhParams: params } });
        ctx.selectedRunningHubRef = () => ({ id: 'app-1', entry: { fields: entryFields } });
        ctx.runningHubTarget = () => ({ connection_id: 'c', resource_id: 'r' });
        ctx.rhUploadValueIfNeeded = async value => value;
        return ctx;
    };
    const build = async (ctx, media = {}) => vm.runInContext('rhBuildNodeInfoList', ctx)(media, ctx.settings, {});
    const byName = list => Object.fromEntries(list.map(item => [item.fieldName, item.fieldValue]));

    it('sends every parameter, including ones not exposed on the canvas', async () => {
        const list = await build(setup());
        expect(list.map(item => item.fieldName).sort()).toEqual(['hires', 'image', 'negative', 'seed', 'steps', 'text']);
    });

    it('sends the saved default for parameters that are not exposed', async () => {
        const values = byName(await build(setup()));
        expect(values.seed).toBe(12345);
        expect(values.hires).toBe('false');
        // text is normalised the same way as exposed text
        expect(values.negative).toBe('blurry\nlow quality');
    });

    it('ignores canvas user input for parameters that are not exposed', async () => {
        const params = { '3::seed': { value: '999' }, '4::negative': { value: 'user typed' } };
        const values = byName(await build(setup(fields, params)));
        expect(values.seed).toBe(12345);
        expect(values.negative).toBe('blurry\nlow quality');
    });

    it('still uses the user value for exposed parameters', async () => {
        const values = byName(await build(setup(fields, { '3::steps': { value: '35' } })));
        expect(values.steps).toBe(35);
    });

    it('rhAllFields includes unexposed fields; rhActiveFields only exposed', () => {
        const ctx = setup();
        expect(vm.runInContext('rhAllFields().length', ctx)).toBe(6);
        expect(vm.runInContext('rhActiveFields().map(f => f.fieldName)', ctx).sort()).toEqual(['image', 'steps', 'text']);
    });
});

describe('API engine selection with retained workflow resources', () => {
    it.each(['runninghub_app', 'comfyui_workflow'])('parameter edits keep the API engine with an old %s resource', kind => {
        const node = {genKind:'video'};
        const sandbox = createGenerationSettingsSandbox({
            settings: {engine:'api', apiKind:'video', resource_id:'old-workflow', videoResolution:'480p'},
            aiResourceIndex: {resources:[{
                id:'old-workflow', kind, name:'video.json', enabled:true,
                settings:{id:'old-app', media:'video'},
            }]},
            comfyWorkflows:[{name:'video.json', media:'video'}],
        });
        sandbox.activeSettingsSubject = () => node;
        sandbox.persistActiveSmartSettings = () => {};
        sandbox.rememberRecentSmartSettings = () => {};
        sandbox.scheduleSave = () => {};
        sandbox.renderDynamicParams = () => sandbox.normalizeWorkflowSourceForNode(node);
        sandbox.setDynamicSetting('videoResolution', '720p');
        expect(sandbox.__state.settings.engine).toBe('api');
        expect(sandbox.__state.settings.videoResolution).toBe('720p');
        sandbox.restoreCanonicalWorkflowSource(sandbox.__state.settings);
        expect(sandbox.__state.settings.engine).toBe('api');
    });

    it('still restores a saved workflow resource when no engine was recorded', () => {
        const sandbox = createGenerationSettingsSandbox({
            aiResourceIndex: {resources:[{id:'workflow', kind:'comfyui_workflow', name:'video.json'}]},
        });
        const saved = {resource_id:'workflow'};
        sandbox.restoreCanonicalWorkflowSource(saved);
        expect(saved).toMatchObject({engine:'comfy', comfyWorkflow:'video.json'});
    });
});

describe('custom video duration after schema reload', () => {
    const schema = {fields:[
        {id:'videoDuration', type:'number', default:5, options:[5,10,15], min:1, max:60, step:1},
        {id:'videoResolution', type:'dropdown', default:'480p', options:['480p','720p','1080p','4k']},
    ]};
    it.each([8, 12, 30, '12'])('keeps saved custom duration %s when reapplying the server schema', duration => {
        const ctx = createGenerationSettingsSandbox({settings:{videoDuration:duration, videoResolution:'720p'}});
        ctx.applyCanvasSchemaDefaults('video', schema);
        expect(ctx.__state.settings.videoDuration).toBe(duration);
        expect(ctx.__state.settings.videoResolution).toBe('720p');
    });
    it('keeps a custom duration when using the offline fallback schema', () => {
        const ctx = createGenerationSettingsSandbox({settings:{videoDuration:12}});
        ctx.applyCanvasSchemaDefaults('video', ctx.defaultCanvasParameterSchema('video'));
        expect(ctx.__state.settings.videoDuration).toBe(12);
    });
    it('still resets invalid dropdown values to their default', () => {
        const ctx = createGenerationSettingsSandbox({settings:{videoDuration:12, videoResolution:'invalid'}});
        ctx.applyCanvasSchemaDefaults('video', schema);
        expect(ctx.__state.settings.videoResolution).toBe('480p');
    });
});

describe('new generation node adopts API-settings defaults', () => {
    const schema = {fields:[
        {id:'videoDuration', type:'number', default:4, options:[4,5,6], min:4, max:15, step:1},
        {id:'videoAspect', default:'16:9', options:['16:9','9:16','source']},
        {id:'videoResolution', type:'dropdown', default:'720p', options:['720p','1080p']},
        {id:'videoGenerateAudio', type:'boolean', default:true},
    ]};
    const initial = {videoDuration:5, videoAspect:'16:9', videoResolution:'', videoGenerateAudio:false};

    it('force mode replaces still-valid built-in values with the configured defaults', () => {
        const ctx = createGenerationSettingsSandbox({settings:{...initial}});
        ctx.applyCanvasSchemaDefaults('video', schema, {force:true});
        expect(ctx.__state.settings).toMatchObject({videoDuration:4, videoResolution:'720p', videoGenerateAudio:true});
    });

    it('without force an existing valid value is kept (existing nodes are untouched)', () => {
        const ctx = createGenerationSettingsSandbox({settings:{...initial, videoGenerateAudio:false}});
        ctx.applyCanvasSchemaDefaults('video', schema);
        expect(ctx.__state.settings).toMatchObject({videoDuration:5, videoGenerateAudio:false, videoResolution:'720p'});
    });

    it('force mode ignores a configured default that is outside its own options/range', () => {
        const ctx = createGenerationSettingsSandbox({settings:{...initial, videoDuration:5}});
        ctx.applyCanvasSchemaDefaults('video', {fields:[
            {id:'videoDuration', type:'number', default:99, min:4, max:15},
            {id:'videoResolution', type:'dropdown', default:'8k', options:['720p','1080p']},
        ]}, {force:true});
        expect(ctx.__state.settings.videoDuration).toBe(5);
        expect(ctx.__state.settings.videoResolution).toBe('720p');
    });

    it('force mode does not touch fields that have no configured default', () => {
        const ctx = createGenerationSettingsSandbox({settings:{...initial, videoDuration:7}});
        ctx.applyCanvasSchemaDefaults('video', {fields:[{id:'videoDuration', type:'number', min:4, max:15}]}, {force:true});
        expect(ctx.__state.settings.videoDuration).toBe(7);
    });
});

describe('pendingNewNodeForSchema', () => {
    const target = {connection_id:'c1', model_id:'m1', resource_id:''};
    function make(node, settings) {
        return createGenerationSettingsSandbox({settings, fns:{}, extra:{activeSettingsSubject:() => node}});
    }
    it('returns the node only while pending, of the same kind, and for the model it actually uses', () => {
        const node = {genKind:'video', schemaDefaultsPending:true};
        const ctx = make(node, {videoConnectionId:'c1', videoModelId:'m1', videoResourceId:''});
        expect(ctx.pendingNewNodeForSchema('video', target)).toBe(node);
        expect(ctx.pendingNewNodeForSchema('image', target)).toBeNull();
        expect(ctx.pendingNewNodeForSchema('video', {...target, model_id:'other'})).toBeNull();
    });
    it('returns null for an existing node (no pending flag) or before the model is resolved', () => {
        expect(make({genKind:'video'}, {videoConnectionId:'c1', videoModelId:'m1'}).pendingNewNodeForSchema('video', target)).toBeNull();
        expect(make({genKind:'video', schemaDefaultsPending:true}, {}).pendingNewNodeForSchema('video', target)).toBeNull();
    });
});

describe('new node inherits parameters from the last used model (方案C)', () => {
    const target = {connection_id:'c1', model_id:'m1', resource_id:''};
    function make(recent) {
        return createGenerationSettingsSandbox({settings:{}, extra:{recentSmartSettingsForMode:key => recent[key] || {}}});
    }
    it('records the last used model ids of the node kind before the node is created', () => {
        const ctx = make({'api:image':{connection_id:'c1', model_id:'m1', resource_id:'', ratio:'16:9'}, 'api:video':{videoConnectionId:'v1', videoModelId:'vm1'}});
        expect(ctx.inheritedModelTargetForNewNode('image')).toEqual({connection_id:'c1', model_id:'m1', resource_id:''});
        expect(ctx.inheritedModelTargetForNewNode('video')).toEqual({connection_id:'v1', model_id:'vm1', resource_id:''});
    });
    it('returns null when nothing was used before, or for the workflow kind', () => {
        const ctx = make({'api:image':{connection_id:'c1', model_id:'m1'}});
        expect(ctx.inheritedModelTargetForNewNode('video')).toBeNull();
        expect(ctx.inheritedModelTargetForNewNode('workflow')).toBeNull();
        expect(make({}).inheritedModelTargetForNewNode('image')).toBeNull();
    });
    it('keeps the inherited parameters only when the node ends up on the same model', () => {
        const ctx = make({});
        const node = {schemaInheritedFrom:{...target}};
        expect(ctx.newNodeKeepsInheritedSettings(node, target)).toBe(true);
        expect(ctx.newNodeKeepsInheritedSettings(node, {...target, model_id:'m2'})).toBe(false);
        expect(ctx.newNodeKeepsInheritedSettings(node, {...target, connection_id:'c2'})).toBe(false);
    });
    it('uses the schema defaults when there was nothing to inherit from', () => {
        expect(make({}).newNodeKeepsInheritedSettings({}, target)).toBe(false);
    });
    it('refreshCanvasParameterSchema forces defaults only when the inherited settings are not kept, and clears both markers', () => {
        const src = fs.readFileSync(new URL('../src/canvas/generation-settings.js', import.meta.url), 'utf8');
        expect(src).toContain('{force:Boolean(newNode) && !newNodeKeepsInheritedSettings(newNode, target)}');
        expect(src).toContain('delete newNode.schemaInheritedFrom;');
    });
    it('createGenerationNodeByKind reads the inherited model before the node is created, and skips workflow nodes', () => {
        const src = fs.readFileSync(new URL('../src/canvas/main.js', import.meta.url), 'utf8');
        const start = src.indexOf('function createGenerationNodeByKind(');
        const body = src.slice(start, src.indexOf('\nfunction isSmartAssetImageNode', start));
        expect(body.indexOf('inheritedModelTargetForNewNode(kind)')).toBeGreaterThan(-1);
        expect(body.indexOf('inheritedModelTargetForNewNode(kind)')).toBeLessThan(body.indexOf('createImageNodeAt('));
        expect(body).toContain("if(kind !== 'workflow'){");
        expect(body).toContain('node.schemaInheritedFrom = inheritedFrom');
    });
});

describe('video aspect option labels', () => {
    it('renders the configured label for the source option instead of the raw value', () => {
        const src = fs.readFileSync(new URL('../src/canvas/generation-settings.js', import.meta.url), 'utf8');
        expect(src).toContain("'source'])].map(value => [value, canvasSchemaOptionLabel(aspectField, value)])");
        expect(src).not.toContain("value === 'source' ? 'source' : canvasSchemaOptionLabel(aspectField, value)");
    });
});
