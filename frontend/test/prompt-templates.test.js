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
    it('返回模板的提示词内容', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = { prompt: '一只猫', builtin: true };
        expect(sandbox.promptTemplateText(template)).toBe('一只猫');
    });

    it('非 builtin 模板同样只返回提示词内容', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = { prompt: '一只猫', builtin: false };
        expect(sandbox.promptTemplateText(template)).toBe('一只猫');
    });

    it('会去除首尾空白', () => {
        const sandbox = createPromptTemplatesSandbox();
        const template = { prompt: '  一只猫  ', builtin: true };
        expect(sandbox.promptTemplateText(template)).toBe('一只猫');
    });

    it('模板为空时返回空字符串', () => {
        const sandbox = createPromptTemplatesSandbox();
        expect(sandbox.promptTemplateText(null)).toBe('');
    });
});

describe('promptTemplateName / promptTemplateScene', () => {
    it('中文模式下返回 name/scene', () => {
        const sandbox = createPromptTemplatesSandbox({ studioI18n: { lang: () => 'zh' } });
        const template = { name: '中文名', name_en: 'English Name', scene: '场景', scene_en: 'Scene' };
        expect(sandbox.promptTemplateName(template)).toBe('中文名');
        expect(sandbox.promptTemplateScene(template)).toBe('场景');
    });

    it('始终使用中文字段，即使模板包含英文备用字段', () => {
        const sandbox = createPromptTemplatesSandbox({ studioI18n: { lang: () => 'en' } });
        const template = { name: '中文名', name_en: 'English Name', scene: '场景', scene_en: 'Scene' };
        expect(sandbox.promptTemplateName(template)).toBe('中文名');
        expect(sandbox.promptTemplateScene(template)).toBe('场景');
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
        const template = { name: 'CAT', scene: 'Outdoor', prompt: 'A Cat' };
        const text = sandbox.promptTemplateSearchText(template);
        expect(text).toBe('cat  outdoor  a cat');
    });

    it('字段缺失时用 undefined 占位（Array.join 行为），不抛错', () => {
        const sandbox = createPromptTemplatesSandbox();
        expect(() => sandbox.promptTemplateSearchText({})).not.toThrow();
    });
});

describe('defaultPromptTemplateGroups', () => {
    it('返回2个内置分组：builtin 与 mine', () => {
        const sandbox = createPromptTemplatesSandbox({
            trDict: {
                'smart.tplCatBuiltin': '内置',
                'smart.tplCatMine': '我的',
            },
        });
        const groups = sandbox.defaultPromptTemplateGroups();
        expect(groups.length).toBe(2);
        expect(groups.map(g => g.id)).toEqual(['builtin', 'mine']);
        expect(groups.find(g => g.id === 'builtin').name).toBe('内置');
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
