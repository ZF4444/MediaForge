// M17 prompt-templates.js 的纯逻辑函数单元测试：模板文案格式化、
// 预设默认命名、搜索文本拼接。
import { describe, it, expect } from 'vitest';
import { createPromptTemplatesSandbox } from './prompt-templates-sandbox.js';

describe('defaultPromptPresetName', () => {
    it('取第一行作为默认名称', () => {
        const sandbox = createPromptTemplatesSandbox();
        expect(sandbox.defaultPromptPresetName('第一行\n第二行')).toBe('第一行');
    });

    it('超过28字符截断', () => {
        const sandbox = createPromptTemplatesSandbox();
        const longText = 'a'.repeat(40);
        expect(sandbox.defaultPromptPresetName(longText).length).toBe(28);
    });

    it('空文本时使用兜底翻译 key', () => {
        const sandbox = createPromptTemplatesSandbox({
            trDict: { 'smart.promptPresetDefault': '未命名提示词' },
        });
        expect(sandbox.defaultPromptPresetName('')).toBe('未命名提示词');
    });

    it('只有空白字符时也走兜底', () => {
        const sandbox = createPromptTemplatesSandbox({
            trDict: { 'smart.promptPresetDefault': '未命名提示词' },
        });
        expect(sandbox.defaultPromptPresetName('   \n  ')).toBe('未命名提示词');
    });
});

describe('promptTemplateText', () => {
    it('mode=positive 时只返回正向提示词', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = { positive: '一只猫', negative: '模糊', builtin: true };
        expect(sandbox.promptTemplateText(template, 'positive')).toBe('一只猫');
    });

    it('非 builtin 模板即使 mode=full 也只返回正向提示词', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = { positive: '一只猫', negative: '模糊', builtin: false };
        expect(sandbox.promptTemplateText(template, 'full')).toBe('一只猫');
    });

    it('builtin 模板 mode=full 时拼接负向提示词和参数', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = {
            positive: '一只猫',
            negative: '模糊',
            params: { steps: 20, cfg: 7 },
            builtin: true,
        };
        const text = sandbox.promptTemplateText(template, 'full');
        expect(text).toContain('一只猫');
        expect(text).toContain('Negative prompt:\n模糊');
        expect(text).toContain('Params:\nsteps: 20\ncfg: 7');
    });

    it('builtin 模板没有负向提示词/参数时只返回正向提示词', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = { positive: '一只猫', builtin: true };
        expect(sandbox.promptTemplateText(template, 'full')).toBe('一只猫');
    });

    it('模板为空时返回空字符串', () => {
        const sandbox = createPromptTemplatesSandbox();
        expect(sandbox.promptTemplateText(null, 'positive')).toBe('');
    });
});

describe('promptTemplateName / promptTemplateScene', () => {
    it('中文模式下返回 name/scene', () => {
        const sandbox = createPromptTemplatesSandbox({ studioI18n: { lang: () => 'zh' } });
        const template = { name: '中文名', name_en: 'English Name', scene: '场景', scene_en: 'Scene' };
        expect(sandbox.promptTemplateName(template)).toBe('中文名');
        expect(sandbox.promptTemplateScene(template)).toBe('场景');
    });

    it('英文模式下优先返回 name_en/scene_en', () => {
        const sandbox = createPromptTemplatesSandbox({ studioI18n: { lang: () => 'en' } });
        const template = { name: '中文名', name_en: 'English Name', scene: '场景', scene_en: 'Scene' };
        expect(sandbox.promptTemplateName(template)).toBe('English Name');
        expect(sandbox.promptTemplateScene(template)).toBe('Scene');
    });

    it('英文模式下缺少 _en 字段时回退到中文字段', () => {
        const sandbox = createPromptTemplatesSandbox({ studioI18n: { lang: () => 'en' } });
        const template = { name: '中文名', scene: '场景' };
        expect(sandbox.promptTemplateName(template)).toBe('中文名');
        expect(sandbox.promptTemplateScene(template)).toBe('场景');
    });

    it('模板为空时返回空字符串', () => {
        const sandbox = createPromptTemplatesSandbox();
        expect(sandbox.promptTemplateName(null)).toBe('');
        expect(sandbox.promptTemplateScene(null)).toBe('');
    });
});

describe('promptTemplateSearchText', () => {
    it('拼接所有可搜索字段并转小写（缺失字段被 join 转为空串，不是字面 "undefined"）', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = { name: 'CAT', scene: 'Outdoor', positive: 'A Cat', negative: 'Blurry' };
        const text = sandbox.promptTemplateSearchText(template);
        expect(text).toBe('cat  outdoor  a cat blurry');
    });

    it('字段缺失时用 undefined 占位（Array.join 行为），不抛错', () => {
        const sandbox = createPromptTemplatesSandbox();
        expect(() => sandbox.promptTemplateSearchText({})).not.toThrow();
    });
});

describe('defaultPromptTemplateGroups', () => {
    it('返回6个内置分组，且包含 mine 分组', () => {
        const sandbox = createPromptTemplatesSandbox({
            trDict: {
                'smart.tplCatView': '视角',
                'smart.tplCatStoryboard': '分镜',
                'smart.tplCatCharacter': '角色',
                'smart.tplCatProduct': '产品',
                'smart.tplCatLighting': '光照',
                'smart.tplCatMine': '我的',
            },
        });
        const groups = sandbox.defaultPromptTemplateGroups();
        expect(groups.length).toBe(6);
        expect(groups.map(g => g.id)).toEqual(['view', 'storyboard', 'character', 'product', 'lighting', 'mine']);
        expect(groups.find(g => g.id === 'mine').name).toBe('我的');
    });
});

describe('currentPromptPreset', () => {
    it('按 id 查找预设', () => {
        const sandbox = createPromptTemplatesSandbox({
            promptPresets: [{ id: 'p1', text: 'foo' }, { id: 'p2', text: 'bar' }],
        });
        expect(sandbox.currentPromptPreset('p2').text).toBe('bar');
    });

    it('找不到时返回 null', () => {
        const sandbox = createPromptTemplatesSandbox({ promptPresets: [] });
        expect(sandbox.currentPromptPreset('missing')).toBeNull();
    });
});
