import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../src/canvas/agent/agent-plan.js', import.meta.url), 'utf8');
function targetResolver(stableCanvasTarget) {
  const context = {
    window: { CanvasAgentState: {}, addEventListener() {} },
    document: { addEventListener() {} },
    stableCanvasTarget,
  };
  vm.createContext(context);
  vm.runInContext(source.replace('CanvasAgentPlan={render,collectOverrides};', 'CanvasAgentPlan={resolveStableTarget};'), context);
  return context.CanvasAgentPlan.resolveStableTarget;
}

describe('Agent confirmation parameter schema target', () => {
  it('resolves legacy API image settings through the canvas model resolver', () => {
    const resolve = targetResolver((kind, provider, model) => {
      expect([kind, provider, model]).toEqual(['image', 'provider-a', 'gpt-image-2']);
      return { connection_id: 'connection-a', model_id: 'model-a', resource_id: '' };
    });
    expect(resolve({ engine: 'api', provider_id: 'provider-a', model: 'gpt-image-2' })).toMatchObject({
      connection_id: 'connection-a', model_id: 'model-a', model: 'gpt-image-2',
    });
  });

  it('uses video target IDs rather than leftover image IDs', () => {
    const resolve = targetResolver(() => { throw new Error('Stable target should be preserved'); });
    expect(resolve({
      apiKind: 'video', model: 'image-model', connection_id: 'image-connection',
      videoModel: 'video-model', videoConnectionId: 'video-connection', videoModelId: 'video-id',
    })).toMatchObject({ connection_id: 'video-connection', model_id: 'video-id', model: 'video-model' });
  });
});
