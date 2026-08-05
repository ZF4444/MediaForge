// M21 mention-composer.js 的纯逻辑函数单元测试：拖拽排序辅助、提示词
// 纯文本还原、@提及 token HTML 渲染、生成结果节点判断。
import { describe, it, expect } from 'vitest';
import { createMentionComposerSandbox } from './mention-composer-sandbox.js';

describe('sameOrderedIds', () => {
    it('长度和顺序都相同时返回 true', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.sameOrderedIds(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
    });

    it('长度不同时返回 false', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.sameOrderedIds(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
    });

    it('顺序不同时返回 false', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.sameOrderedIds(['a', 'b', 'c'], ['a', 'c', 'b'])).toBe(false);
    });

    it('两个都为空时返回 true', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.sameOrderedIds(null, undefined)).toBe(true);
    });
});

describe('movedBeforeAfterIds', () => {
    it('placement=before 时把节点移到目标节点之前', () => {
        const sandbox = createMentionComposerSandbox();
        const result = sandbox.movedBeforeAfterIds(['a', 'b', 'c', 'd'], 'd', 'b', 'before');
        expect(result).toEqual(['a', 'd', 'b', 'c']);
    });

    it('placement=after 时把节点移到目标节点之后', () => {
        const sandbox = createMentionComposerSandbox();
        const result = sandbox.movedBeforeAfterIds(['a', 'b', 'c', 'd'], 'a', 'c', 'after');
        expect(result).toEqual(['b', 'c', 'a', 'd']);
    });

    it('movedId 和 targetId 相同时原样返回', () => {
        const sandbox = createMentionComposerSandbox();
        const result = sandbox.movedBeforeAfterIds(['a', 'b', 'c'], 'a', 'a');
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('movedId 不存在于列表时原样返回', () => {
        const sandbox = createMentionComposerSandbox();
        const result = sandbox.movedBeforeAfterIds(['a', 'b', 'c'], 'x', 'b');
        expect(result).toEqual(['a', 'b', 'c']);
    });

    it('过滤掉假值 id', () => {
        const sandbox = createMentionComposerSandbox();
        const result = sandbox.movedBeforeAfterIds(['a', null, 'b', undefined, 'c'], 'c', 'a', 'before');
        expect(result).toEqual(['c', 'a', 'b']);
    });
});

describe('originalPromptTextFromParts', () => {
    it('拼接 text 类型片段', () => {
        const sandbox = createMentionComposerSandbox();
        const text = sandbox.originalPromptTextFromParts([
            { type: 'text', text: '一只猫在' },
            { type: 'text', text: '草地上' },
        ]);
        expect(text).toBe('一只猫在草地上');
    });

    it('image 类型片段还原成 @名称 形式', () => {
        const sandbox = createMentionComposerSandbox();
        const text = sandbox.originalPromptTextFromParts([
            { type: 'text', text: '参考' },
            { type: 'image', name: '猫咪图' },
            { type: 'text', text: '的风格' },
        ]);
        expect(text).toBe('参考@猫咪图的风格');
    });

    it('image 片段没有 name 时用默认文案"图片"', () => {
        const sandbox = createMentionComposerSandbox();
        const text = sandbox.originalPromptTextFromParts([{ type: 'image' }]);
        expect(text).toBe('@图片');
    });

    it('清理多余空格和连续空行', () => {
        const sandbox = createMentionComposerSandbox();
        const text = sandbox.originalPromptTextFromParts([
            { type: 'text', text: '第一行   \n\n\n\n第二行' },
        ]);
        expect(text).toBe('第一行\n\n第二行');
    });

    it('空数组返回空字符串', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.originalPromptTextFromParts([])).toBe('');
        expect(sandbox.originalPromptTextFromParts(null)).toBe('');
    });
});

describe('mentionTokenHtml', () => {
    it('没有 url 时返回空字符串', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.mentionTokenHtml({})).toBe('');
        expect(sandbox.mentionTokenHtml(null)).toBe('');
    });

    it('图片类型渲染 img 标签', () => {
        const sandbox = createMentionComposerSandbox();
        const html = sandbox.mentionTokenHtml({ url: 'http://x/a.png', name: '图A', kind: 'image' });
        expect(html).toContain('class="mention-image-token"');
        expect(html).toContain('<img src="http://x/a.png"');
        expect(html).toContain('data-name="图A"');
    });

    it('视频类型渲染视频海报', () => {
        const sandbox = createMentionComposerSandbox();
        const html = sandbox.mentionTokenHtml({ url: 'http://x/a.mp4', name: '视频A', kind: 'video' });
        expect(html).toContain('<video-poster');
    });

    it('优先使用 alias 而不是 name', () => {
        const sandbox = createMentionComposerSandbox();
        const html = sandbox.mentionTokenHtml({ url: 'http://x/a.png', name: '原名', alias: '别名' });
        expect(html).toContain('data-name="别名"');
    });

    it('没有 name/alias 时使用默认文案"图片"', () => {
        const sandbox = createMentionComposerSandbox();
        const html = sandbox.mentionTokenHtml({ url: 'http://x/a.png' });
        expect(html).toContain('data-name="图片"');
    });
});

describe('isGeneratedResultNode', () => {
    it('非图片节点返回 false', () => {
        const sandbox = createMentionComposerSandbox({
            fns: { isSmartImageNode: () => false },
        });
        expect(sandbox.isGeneratedResultNode({ type: 'smart-prompt' })).toBe(false);
    });

    it('有 runPrompt 字段时判定为生成结果节点', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.isGeneratedResultNode({ type: 'smart-image', runPrompt: '一只猫' })).toBe(true);
    });

    it('有 runInputRefs 时判定为生成结果节点', () => {
        const sandbox = createMentionComposerSandbox();
        expect(sandbox.isGeneratedResultNode({ type: 'smart-image', runInputRefs: [{ id: 'x' }] })).toBe(true);
    });

    it('images 里有 generatedResult 标记时判定为生成结果节点', () => {
        const sandbox = createMentionComposerSandbox();
        const node = { type: 'smart-image', images: [{ url: 'a.png', generatedResult: true }] };
        expect(sandbox.isGeneratedResultNode(node)).toBe(true);
    });

    it('普通上传的图片节点判定为不是生成结果', () => {
        const sandbox = createMentionComposerSandbox();
        const node = { type: 'smart-image', images: [{ url: 'a.png' }] };
        expect(sandbox.isGeneratedResultNode(node)).toBe(false);
    });
});
