import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/ai-connections/main.js'), 'utf8');

// 取出以 marker 开头、到下一个同级（两空格缩进）声明之前的代码块。
function block(marker) {
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.slice(start + marker.length).search(/\n {2}(?:async )?function |\n {2}const /);
  return next < 0 ? source.slice(start) : source.slice(start, start + marker.length + next);
}

// 画布按模型缓存参数 schema，只有收到 providers-changed 才会清缓存。
// API 设置保存成功后必须广播，否则画布 AI 生成节点会一直显示旧的参数显示/默认值。
describe('ai-connections save broadcast', () => {
  it('broadcasts providers-changed on the studio-api channel and to the parent frame', () => {
    const fn = block('function broadcastProvidersChanged()');
    expect(fn).toContain("type: 'providers-changed'");
    expect(fn).toContain("new BroadcastChannel('studio-api')");
    expect(fn).toContain('window.parent?.postMessage');
  });

  it('broadcasts only after the configuration PUT succeeds', () => {
    const save = block('async function save()');
    const put = save.indexOf("apiJson('/api/ai/configuration', {method:'PUT'");
    const broadcast = save.indexOf('broadcastProvidersChanged()');
    const failure = save.indexOf('catch (e)');
    expect(put).toBeGreaterThan(-1);
    expect(broadcast).toBeGreaterThan(put);
    expect(broadcast).toBeLessThan(failure);
  });
});
