import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const settingsSource = readFileSync(new URL('../src/canvas/generation-settings.js', import.meta.url), 'utf8');
const cascadeSource = readFileSync(new URL('../src/canvas/cascade-run.js', import.meta.url), 'utf8');
function setup(options) {
  const api = vi.fn().mockResolvedValue({fields:[{id:'videoAspect', options: options || ['16:9','1:1','9:16']}]});
  const context = vm.createContext({URLSearchParams, canvasParameterSchemaCache:new Map(), canvasApiJson:api,
    imageRefsOnly:refs => (refs || []).filter(ref => ref.url && ref.kind !== 'video')});
  for (const name of ['imageSizeForRatio', 'parseRatioValue']) {
    const start = settingsSource.indexOf(`function ${name}(`);
    const end = settingsSource.indexOf('\n}', start) + 2;
    vm.runInContext(settingsSource.slice(start, end), context);
  }
  const start = cascadeSource.indexOf('async function resolveVideoSourceAspect(');
  const end = cascadeSource.indexOf('async function runApiVideoGeneration(', start);
  vm.runInContext(cascadeSource.slice(start, end), context);
  return {resolve:context.resolveVideoSourceAspect, api, context};
}
const settings = {videoAspect:'source', videoConnectionId:'conn-a', videoModelId:'model-a'};
describe('video source aspect', () => {
  it('uses 9:16 without input images, including video-only input', async () => {
    const {resolve, api} = setup();
    expect(await resolve(settings, [])).toBe('9:16');
    expect(await resolve(settings, [{url:'video.mp4',kind:'video'}])).toBe('9:16');
    expect(api).not.toHaveBeenCalled();
  });
  it('matches only the first image against this model’s supported ratios', async () => {
    const {resolve, api} = setup(['1:1','4:3','9:16']);
    expect(await resolve(settings, [{url:'first',natural_w:1920,natural_h:1080},{url:'second',w:900,h:1600}])).toBe('4:3');
    expect(api.mock.calls[0][0]).toContain('model_id=model-a');
    expect(settings.videoAspect).toBe('source');
  });
  it('matches portrait and square inputs', async () => {
    const {resolve} = setup();
    expect(await resolve(settings, [{url:'portrait',w:1000,h:1800}])).toBe('9:16');
    expect(await resolve(settings, [{url:'square',w:1000,h:1020}])).toBe('1:1');
  });
  it('preserves explicit ratios', async () => {
    const {resolve, api} = setup();
    expect(await resolve({...settings,videoAspect:'16:9'}, [])).toBe('16:9');
    expect(api).not.toHaveBeenCalled();
  });
  it('reads the first image dimensions when metadata is absent', async () => {
    const {resolve, context} = setup();
    context.Image = class { naturalWidth=1600; naturalHeight=900; set src(value) { this.onload(); } };
    expect(await resolve(settings, [{url:'first'}])).toBe('16:9');
  });
});

it('keeps source selected when model parameter defaults are refreshed', () => {
  const context = vm.createContext({settings:{videoAspect:'source'}});
  const start = settingsSource.indexOf('function applyCanvasSchemaDefaults(');
  const end = settingsSource.indexOf('async function refreshCanvasParameterSchema(', start);
  vm.runInContext(settingsSource.slice(start, end), context);
  context.applyCanvasSchemaDefaults('video', {fields:[{id:'videoAspect',default:'16:9',options:['16:9','9:16']}]});
  expect(context.settings.videoAspect).toBe('source');
});
