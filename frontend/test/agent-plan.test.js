import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(new URL('../src/canvas/agent/agent-plan.js', import.meta.url), 'utf8');
function planSandbox(stableCanvasTarget, resources = []) {
  const context = {
    window: { CanvasAgentState: {}, addEventListener() {} },
    document: { addEventListener() {} },
    stableCanvasTarget,
    aiResourceIndex: { resources },
    URLSearchParams,
  };
  vm.createContext(context);
  vm.runInContext(source.replace('CanvasAgentPlan={render,collectOverrides};', 'CanvasAgentPlan={resolveStableTarget,planValues,schemaUrl,configurationSteps};'), context);
  return context.CanvasAgentPlan;
}
const targetResolver = resolver => planSandbox(resolver).resolveStableTarget;

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

  it('recognizes a canonical local workflow even without engine settings', () => {
    const { planValues } = planSandbox();
    const step = { id:'wf', node:{ semantic_type:'workflow_generation', capability:'comfyui.workflow.image', resource_id:'D-style.json', params:{runSettings:{prompt:'custom prompt'}} } };
    const values = planValues(step);
    expect(values.workflow).toBe(true);
    expect(values.settings).toMatchObject({engine:'comfy',resource_id:'D-style.json',comfyWorkflow:'D-style.json'});
    expect(values.content).toBe('custom prompt');
    expect(step.node.params.runSettings.engine).toBeUndefined();
  });

  it('uses top-level canonical resource IDs to select RunningHub native fields', () => {
    const { planValues, schemaUrl } = planSandbox(undefined,[{id:'rh-resource',kind:'runninghub_app',name:'D风格文生图'}]);
    const values = planValues({id:'rh',node:{semantic_type:'image_generation',capability:'runninghub.app.image',connection_id:'rh-connection',resource_id:'rh-resource',params:{runSettings:{prompt:'test'}}}});
    expect(values.workflow).toBe(true);
    expect(values.settings.engine).toBe('runninghub');
    const query = new URL(schemaUrl('runninghub.app.image',values.settings),'https://example.test').searchParams;
    expect(query.get('resource_id')).toBe('rh-resource');
    expect(query.get('connection_id')).toBe('rh-connection');
  });

  it('keeps ordinary image nodes on the image parameter path', () => {
    const { planValues } = planSandbox();
    expect(planValues({node:{semantic_type:'image_generation',capability:'image.text_to_image',params:{runSettings:{engine:'api',model:'gpt-image-2'}}}}).workflow).toBe(false);
  });
});


describe('Agent confirmation configurations', () => {
  it('shows one configuration for create and run, even if run repeats the node', () => {
    const { configurationSteps } = planSandbox();
    const create = {id:'create',action:'canvas.create_node',node:{title:'X2'}};
    const steps = [create,{id:'run',action:'canvas.run_node',target_node_id:'create',node:{title:'X2'}}];
    expect(configurationSteps(steps).map(step=>step.id)).toEqual(['create']);
    expect(steps).toHaveLength(2);
  });
  it('keeps distinct nodes even when their workflow and title match', () => {
    const { configurationSteps } = planSandbox();
    const steps = ['a','b'].map(id=>({id,action:'canvas.create_node',node:{title:'X2'}}));
    expect(configurationSteps(steps)).toHaveLength(2);
  });
  it('retains standalone runs and merges update followed by run', () => {
    const { configurationSteps } = planSandbox();
    const steps = [
      {id:'update',action:'canvas.update_node_params',target_node_id:'existing',node:{params:{}}},
      {id:'run',action:'canvas.run_node',target_node_id:'existing'},
      {id:'other',action:'canvas.run_node',target_node_id:'other-node'},
    ];
    expect(configurationSteps(steps).map(step=>step.id)).toEqual(['update','other']);
  });
});


it('merges the actual X2 create/run plan using from_step', () => {
  const { configurationSteps } = planSandbox();
  const steps = [
    {id:'step_create_volcano_node',action:'canvas.create_node',node:{title:'X2场景单体-喷发火山'}},
    {id:'step_run_volcano_node',action:'canvas.run_node',target_node_id:'',from_step:'step_create_volcano_node',node:null},
  ];
  expect(configurationSteps(steps).map(step=>step.id)).toEqual(['step_create_volcano_node']);
});
