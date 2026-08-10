import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { createFieldEditorSandbox } from './field-editor-sandbox.js';

function run(ctx, expr) {
    return vm.runInContext(expr, ctx);
}

describe('guessType', () => {
    it('boolean 值识别为 boolean 类型', () => {
        const ctx = createFieldEditorSandbox();
        expect(run(ctx, "guessType(true, 'enabled')")).toBe('boolean');
    });

    it('数字值默认识别为 number，字段名含 strength/cfg/denoise 时识别为 slider', () => {
        const ctx = createFieldEditorSandbox();
        expect(run(ctx, "guessType(5, 'steps')")).toBe('number');
        expect(run(ctx, "guessType(0.8, 'strength')")).toBe('slider');
        expect(run(ctx, "guessType(7.5, 'cfg')")).toBe('slider');
        expect(run(ctx, "guessType(0.5, 'denoise')")).toBe('slider');
    });

    it('字符串按字段名/内容关键字识别为 textarea/video/audio/image/text', () => {
        const ctx = createFieldEditorSandbox();
        expect(run(ctx, "guessType('a long prompt text', 'prompt')")).toBe('textarea');
        expect(run(ctx, "guessType('clip.mp4', 'video_file')")).toBe('video');
        expect(run(ctx, "guessType('song.mp3', 'audio_file')")).toBe('audio');
        expect(run(ctx, "guessType('photo.png', 'image_file')")).toBe('image');
        expect(run(ctx, "guessType('short', 'name')")).toBe('text');
    });

    it('超过 60 字符的字符串即使字段名不含关键字也识别为 textarea', () => {
        const ctx = createFieldEditorSandbox();
        const longText = 'x'.repeat(61);
        expect(run(ctx, `guessType('${longText}', 'random_field')`)).toBe('textarea');
    });

    it('其它类型（如 undefined/object）兜底为 text', () => {
        const ctx = createFieldEditorSandbox();
        expect(run(ctx, "guessType(undefined, 'x')")).toBe('text');
        expect(run(ctx, "guessType({}, 'x')")).toBe('text');
    });
});

describe('makeFieldId', () => {
    it('生成以 f_ 为前缀的随机 id', () => {
        const ctx = createFieldEditorSandbox();
        const id = run(ctx, 'makeFieldId()');
        expect(id).toMatch(/^f_[a-z0-9]+$/);
    });

    it('每次生成的 id 不同（极小概率碰撞，多次生成验证唯一性）', () => {
        const ctx = createFieldEditorSandbox();
        const ids = new Set();
        for (let i = 0; i < 20; i++) {
            ids.add(run(ctx, 'makeFieldId()'));
        }
        expect(ids.size).toBe(20);
    });
});

describe('fieldFor', () => {
    it('按 node + input 组合查找已暴露的字段', () => {
        const fields = [{ id: 'f1', node: 'node1', input: 'seed' }];
        const ctx = createFieldEditorSandbox({ currentConfig: { fields } });
        expect(run(ctx, "JSON.stringify(fieldFor('node1', 'seed'))")).toBe(JSON.stringify(fields[0]));
    });

    it('找不到时返回 undefined', () => {
        const ctx = createFieldEditorSandbox({ currentConfig: { fields: [] } });
        expect(run(ctx, "fieldFor('node1', 'seed')")).toBeUndefined();
    });
});

describe('updateField', () => {
    it('编辑字段名称时不重建节点弹窗，避免输入框失去焦点', () => {
        let refreshCount = 0;
        const ctx = createFieldEditorSandbox({
            popupNodeId: 'node1',
            currentConfig: {fields: [{id: 'f1', node: 'node1', input: 'value', name: ''}]},
            fns: {refreshPopupBody: () => { refreshCount += 1; }},
        });

        run(ctx, "updateField('f1', 'name', 'ti')");

        expect(run(ctx, "currentConfig.fields[0].name")).toBe('ti');
        expect(refreshCount).toBe(0);
    });
});
