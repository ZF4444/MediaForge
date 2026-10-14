(function(){
  const state=window.CanvasAgentState;
  let schemaRequest=0;
  const clone=value=>JSON.parse(JSON.stringify(value||{}));
  const text=step=>step.description||step.node?.title||step.action||'执行画布操作';
  const pathValue=(value,path)=>String(path||'').split('.').filter(Boolean).reduce((item,key)=>item&&typeof item==='object'?item[key]:undefined,value);
  const setPath=(target,path,value)=>{const keys=String(path||'').split('.').filter(Boolean);let cursor=target;keys.slice(0,-1).forEach(key=>cursor=cursor[key]||={});if(keys.length)cursor[keys.at(-1)]=value;};
  const primitive=value=>['string','number','boolean'].includes(typeof value);
  const resourceIndex=()=>{const index=typeof aiResourceIndex!=='undefined'?aiResourceIndex:window.aiResourceIndex;return index&&typeof index==='object'?index:{connections:[],models:[],resources:[]};};
  // Legacy plans use engine-specific settings; canonical plans carry target
  // IDs on SemanticNode. planValues promotes those IDs before resolving them.
  function resolveStableTarget(settings){
    const engine=String(settings.engine||'').toLowerCase();
    const video=settings.apiKind==='video'||Boolean(settings.videoModel);
    const target={connection_id:String((video?settings.videoConnectionId||settings.connection_id:settings.connection_id)||''),model_id:String((video?settings.videoModelId||settings.model_id:settings.model_id)||''),resource_id:String((video?settings.videoResourceId||settings.resource_id:settings.resource_id)||''),model:String((video?settings.videoModel:settings.model)||'')};
    if(target.connection_id||target.model_id||target.resource_id)return target;
    try{
      if(engine==='runninghub'&&typeof selectedRunningHubRef==='function'&&typeof runningHubTarget==='function'){
        const ref=selectedRunningHubRef(settings);const stable=runningHubTarget(ref,settings)||{};
        target.connection_id=String(stable.connection_id||'');target.model_id=String(stable.model_id||'');target.resource_id=String(stable.resource_id||'');
      }else if(engine==='comfy'){
        // ComfyUI workflows resolve by workflow name; the backend keys the
        // schema on `model` rather than a stable resource id.
        target.model=String(settings.comfyWorkflow||target.model||'');
        if(typeof stableCanvasTarget==='function')Object.assign(target,stableCanvasTarget('comfyui_workflow','comfyui','',target.model));
      }else if(typeof stableCanvasTarget==='function'){
        Object.assign(target,stableCanvasTarget(video?'video':'image',video?settings.videoProvider:settings.provider_id,target.model));
      }
    }catch(_){/* resolvers unavailable (e.g. tests); fall back to legacy model */}
    return target;
  }
  const schemaUrl=(capability,settings)=>{const target=resolveStableTarget(settings);const params=new URLSearchParams({capability,connection_id:target.connection_id,model_id:target.model_id,resource_id:target.resource_id});if(!target.connection_id&&!target.model_id&&!target.resource_id&&target.model)params.set('model',target.model);return `/api/canvas/capability-parameters?${params.toString()}`;};
  // The prompt now lives in params.runSettings.prompt for every engine, mirroring
  // the backend SemanticNode contract. Keep a single accessor so the top prompt
  // box, RunningHub prompt-role fields, and overrides stay in sync.
  const readPrompt=params=>{
    const rs=params&&typeof params==='object'?params.runSettings:null;
    if(rs&&typeof rs.prompt==='string'&&rs.prompt)return rs.prompt;
    // Fallback: an agent plan may store the prompt inside a RunningHub app's
    // prompt-role field instead of runSettings.prompt. The field key can be a
    // bare name ("text"/"prompt") or the canonical "nodeId::fieldName" form,
    // and the value can be a bare string or the {value:...} envelope. Recover
    // it so the top prompt box is populated even for non-canonical params.
    const rh=rs&&typeof rs.rhParams==='object'?rs.rhParams:null;
    if(rh){
      const unwrap=v=>(v&&typeof v==='object'&&'value'in v?v.value:v);
      for(const[key,raw]of Object.entries(rh)){
        const name=String(key).includes('::')?String(key).split('::').pop():String(key);
        if(name==='text'||name==='prompt'){const v=unwrap(raw);if(typeof v==='string'&&v)return v;}
      }
    }
    return '';
  };
  const writePrompt=(params,value)=>{const rs=(params.runSettings&&typeof params.runSettings==='object')?params.runSettings:(params.runSettings={});rs.prompt=value;};
  function planValues(step){
    const node=step.node||{},params=clone(node.params);
    const settings=params.runSettings||params;
    for(const key of ['connection_id','model_id','resource_id'])if(node[key]&&!settings[key])settings[key]=String(node[key]);
    const resource=(resourceIndex().resources||[]).find(item=>item.id===settings.resource_id);
    const capability=String(node.capability||'');
    const workflow=node.semantic_type==='workflow_generation'||params.genKind==='workflow'||node.genKind==='workflow'||capability.startsWith('comfyui.workflow.')||capability.startsWith('runninghub.')||['runninghub_app','comfyui_workflow'].includes(resource?.kind)||['comfy','runninghub'].includes(settings.engine);
    if(workflow){
      settings.engine=capability.startsWith('runninghub.')||resource?.kind==='runninghub_app'||settings.engine==='runninghub'?'runninghub':'comfy';
      if(settings.engine==='comfy'&&!settings.comfyWorkflow)settings.comfyWorkflow=resource?.name||settings.resource_id||'';
    }else if(node.semantic_type==='video_generation'&&!settings.apiKind)settings.apiKind='video';
    return {step_id:step.id,title:node.title||'',content:readPrompt(params),params,settings,workflow,resource};
  }
  function label(field){return String(field.display_name||field.name||field.id||'参数');}
  function options(field){
    const values=Array.isArray(field.display_options)?field.display_options:[];
    if(values.length)return values;
    const labels=Array.isArray(field.option_labels)?field.option_labels:[];
    return (field.options||[]).map((value,index)=>({value,label:String(labels[index]||value)}));
  }
  function fieldIcon(field){
    return ({provider_id:'plug-zap',videoProvider:'plug-zap',model:'sparkles',videoModel:'film',resolution:'monitor',videoResolution:'monitor',ratio:'scan',videoAspect:'scan',quality:'sliders-horizontal',count:'copy',rhInstanceType:'cpu'})[String(field.id||'')]||'sliders-horizontal';
  }
  function ratioIcon(value){
    if(['2:3','3:4'].includes(String(value))) return String(value)==='2:3'?'r-portrait':'r-portrait43';
    if(['3:2','4:3'].includes(String(value))) return String(value)==='3:2'?'r-landscape':'r-landscape43';
    if(['16:9','21:9'].includes(String(value))) return 'r-wide';
    if(['9:16','9:21'].includes(String(value))) return 'r-story';
    return String(value)==='source'?'r-source':String(value)==='custom'?'r-custom':'';
  }
  function closePopovers(except=null){document.querySelectorAll('#canvasAgentPlan .canvas-agent-smart-control.pinned').forEach(control=>{if(control!==except){control.querySelector('[popover]')?.hidePopover();control.classList.remove('pinned');control.querySelector('.smart-pill')?.setAttribute('aria-expanded','false');}});}
  function openPopover(wrapper){
    const popover=wrapper.querySelector('[popover]'),pill=wrapper.querySelector('.smart-pill');
    if(!popover)return;
    wrapper.classList.add('pinned');pill.setAttribute('aria-expanded','true');popover.showPopover();
    const anchor=pill.getBoundingClientRect(),panel=wrapper.closest('.canvas-agent-panel')?.getBoundingClientRect();
    const margin=12,gap=8,viewportWidth=document.documentElement.clientWidth,viewportHeight=document.documentElement.clientHeight;
    const leftBound=Math.max(margin,panel?.left+margin||margin),rightBound=Math.min(viewportWidth-margin,panel?.right-margin||viewportWidth-margin);
    popover.style.maxWidth=`${Math.max(0,rightBound-leftBound)}px`;
    popover.style.maxHeight=`${Math.max(0,viewportHeight-margin*2)}px`;
    const size=popover.getBoundingClientRect(),below=Math.max(0,viewportHeight-margin-anchor.bottom-gap),above=Math.max(0,anchor.top-margin-gap);
    const upwards=size.height>below&&above>below,available=upwards?above:below;
    popover.style.maxHeight=`${available}px`;
    const height=Math.min(size.height,available);
    popover.style.left=`${Math.max(leftBound,Math.min(anchor.left,rightBound-size.width))}px`;
    popover.style.top=`${upwards?anchor.top-gap-height:anchor.bottom+gap}px`;
  }
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#canvasAgentPlan .canvas-agent-smart-control'))closePopovers();},true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closePopovers();});
  document.addEventListener('scroll',event=>{if(!event.target.closest?.('.canvas-agent-options-popover'))closePopovers();},true);
  window.addEventListener('resize',()=>closePopovers());
  function appendIcon(parent,name,klass=''){const icon=document.createElement('i');icon.setAttribute('data-lucide',name);if(klass)icon.className=klass;parent.appendChild(icon);}
  function choiceButton(value,caption,active,onPick,klass=''){
    const button=document.createElement('button');button.type='button';button.dataset.agentValue=String(value);button.className=`${klass} ${active?'active':''}`.trim();button.textContent=caption;button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();onPick(value);});return button;
  }
  function control(field,value,onChange,interactive){
    const id=String(field.id||'');let type=String(field.type||'text');
    if(id==='count'&&type==='number') field={...field,type:'dropdown',options:Array.from({length:Math.max(1,Number(field.max??4)-Number(field.min??1)+1)},(_,index)=>Number(field.min??1)+index)};
    type=String(field.type||type);const configurable=interactive&&(field.ui?.configurable!==false||['model','videoModel'].includes(id));
    if(type==='dropdown'){
      const values=options(field),current=String(value??'');const wrapper=document.createElement('div');wrapper.className=`canvas-agent-smart-control smart-control ${String(field.id||'')}-control`;
      const pill=document.createElement('button');pill.type='button';pill.className='smart-pill';pill.title=label(field);pill.disabled=!configurable;pill.setAttribute('aria-expanded','false');appendIcon(pill,fieldIcon(field));const summary=document.createElement('span');if(['model','videoModel'].includes(id))summary.className='sub';summary.textContent=String(values.find(option=>String(option.value)===current)?.label??current??'');pill.appendChild(summary);pill.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const open=!wrapper.classList.contains('pinned');closePopovers();if(open)openPopover(wrapper);});wrapper.appendChild(pill);
      if(configurable){
        const popover=document.createElement('div');popover.className='smart-popover compact-popover canvas-agent-options-popover';popover.setAttribute('popover','manual');const title=document.createElement('div');title.className='smart-popover-title';title.textContent=label(field);popover.appendChild(title);
        const pick=next=>{onChange(next);summary.textContent=String(values.find(option=>String(option.value)===String(next))?.label??next);popover.querySelectorAll('[data-agent-value]').forEach(button=>button.classList.toggle('active',button.dataset.agentValue===String(next)));closePopovers();};
        if(id==='ratio'||id==='videoAspect'){
          const grid=document.createElement('div');grid.className='ratio-grid';values.forEach(option=>{const button=choiceButton(option.value,option.label,String(option.value)===current,pick,'ratio-option');const glyph=document.createElement('span');glyph.className=`ratio-icon ${ratioIcon(option.value)}`;const text=document.createElement('span');text.textContent=String(option.label);button.textContent='';button.append(glyph,text);grid.appendChild(button);});popover.appendChild(grid);
        }else if(id==='count'){
          const grid=document.createElement('div');grid.className='count-grid';values.forEach(option=>grid.appendChild(choiceButton(option.value,option.label,String(option.value)===current,pick,'count-cell')));popover.appendChild(grid);
        }else if(['resolution','videoResolution','quality'].includes(id)){
          const row=document.createElement('div');row.className='seg-row';values.forEach(option=>row.appendChild(choiceButton(option.value,option.label,String(option.value)===current,pick)));popover.appendChild(row);
        }else{
          const list=document.createElement('div');list.className='model-list';values.forEach(option=>list.appendChild(choiceButton(option.value,option.label,String(option.value)===current,pick,'direct-option')));popover.appendChild(list);
        }
        wrapper.appendChild(popover);
      }
      return wrapper;
    }
    if(type==='boolean'){
      const button=document.createElement('button');button.type='button';button.className=`setting-check ${Boolean(value)?'active':''}`;button.disabled=!configurable;const check=document.createElement('span');check.className='check-box';const caption=document.createElement('span');caption.textContent=label(field);button.append(check,caption);button.addEventListener('click',()=>onChange(!Boolean(value)));return button;
    }
    const wrapper=document.createElement('div');wrapper.className=`num-compact canvas-agent-number-control ${type==='textarea'?'rh-text-param':''}`;wrapper.title=label(field);const caption=document.createElement('span');caption.className='num-label';caption.textContent=label(field);wrapper.appendChild(caption);
    const input=document.createElement(type==='textarea'?'textarea':'input');
    if(type==='number'||type==='slider'){input.type='number';if(field.min!=null)input.min=field.min;if(field.max!=null)input.max=field.max;if(field.step!=null)input.step=field.step;}
    input.value=value??'';input.disabled=!configurable;if(type==='textarea')input.rows=2;input.addEventListener('input',()=>onChange((type==='number'||type==='slider')&&input.value!==''?Number(input.value):input.value));wrapper.appendChild(input);return wrapper;
  }
  function schemaField(field,values,paramsPath,interactive,onLayoutChange){
    // RunningHub app fields persist their value wrapped as {value:...} under
    // runSettings.rhParams (keyed by `nodeId::fieldName`). Unwrap for display
    // and re-wrap on change so the shape matches what the canvas node writes.
    const wrapped=Boolean(field.nodeId||field.fieldName)||/(^|\.)rhParams$/.test(String(paramsPath||''));
    const stored=pathValue(values.params,`${paramsPath}.${field.id}`);
    const value=(wrapped&&stored&&typeof stored==='object'?stored.value:stored)??field.default??'';
    return control(field,value,next=>{setPath(values.params,`${paramsPath}.${field.id}`,wrapped?{value:next}:next);onLayoutChange?.(String(field.id));},interactive);
  }
  // Shared read/write for a schema field's stored value, unwrapping the
  // RunningHub {value:...} envelope when present.
  function fieldStore(field,values,paramsPath){
    const wrapped=Boolean(field.nodeId||field.fieldName)||/(^|\.)rhParams$/.test(String(paramsPath||''));
    return {
      get(){const stored=pathValue(values.params,`${paramsPath}.${field.id}`);return (wrapped&&stored&&typeof stored==='object'?stored.value:stored)??field.default??'';},
      set(next){setPath(values.params,`${paramsPath}.${field.id}`,wrapped?{value:next}:next);},
    };
  }
  function workflowSource(values){
    const settings=values.settings,wrapper=document.createElement('div');wrapper.className='smart-control workflow-control';
    const pill=document.createElement('button');pill.type='button';pill.className='smart-pill';pill.disabled=true;
    const workflows=typeof comfyWorkflows!=='undefined'?comfyWorkflows:[];
    const workflow=workflows.find(item=>item.name===settings.comfyWorkflow);
    const caption=values.resource?.name||workflow?.title||settings.comfyWorkflow||values.title||'工作流';
    appendIcon(pill,'layers');const text=document.createElement('span');text.className='sub';text.textContent=caption;pill.title=caption;pill.appendChild(text);wrapper.appendChild(pill);return wrapper;
  }
  function workflowSourceControls(values,interactive){
    const controls=[workflowSource(values)];
    if(values.settings.engine==='runninghub'){
      const machine=control({id:'rhInstanceType',name:'显存',type:'dropdown',display_options:[{value:'',label:'24G'},{value:'plus',label:'48G'}]},values.settings.rhInstanceType==='plus'?'plus':'',next=>{setPath(values.params,values.params.runSettings?'runSettings.rhInstanceType':'rhInstanceType',next);},interactive);
      machine.classList.add('rh-machine-control');controls.push(machine);
    }
    return controls;
  }
  function workflowParameters(fields,values,paramsPath,interactive){
    const wrapper=document.createElement('div');wrapper.className='canvas-agent-smart-control smart-control workflow-params-control';
    const pill=document.createElement('button');pill.type='button';pill.className='smart-pill workflow-params-summary';pill.setAttribute('aria-label','工作流参数');pill.setAttribute('aria-expanded','false');
    appendIcon(pill,'sliders-horizontal');const summary=document.createElement('span');summary.className='sub';pill.appendChild(summary);appendIcon(pill,'chevron-down','pill-caret');wrapper.appendChild(pill);
    const popover=document.createElement('div');popover.className='smart-popover workflow-params-popover canvas-agent-options-popover';popover.setAttribute('popover','manual');wrapper.appendChild(popover);
    const updateSummary=()=>{const text=fields.map(field=>String(fieldStore(field,values,paramsPath).get()??'').trim()).filter(Boolean).join(' · ')||'参数设置';summary.textContent=text;pill.title=text;};
    fields.forEach(field=>{
      const row=document.createElement('div');row.className='workflow-param-field';const caption=document.createElement('div');caption.className='workflow-param-label';caption.textContent=label(field);row.appendChild(caption);
      const store=fieldStore(field,values,paramsPath),value=store.get(),type=String(field.type||'text');let input;
      if(type==='dropdown'||options(field).length){input=document.createElement('select');input.className='workflow-param-select';const choices=options(field);if(!choices.some(option=>String(option.value)===String(value)))choices.unshift({value,label:String(value)});choices.forEach(option=>{const item=document.createElement('option');item.value=option.value;item.textContent=option.label;item.selected=String(option.value)===String(value);input.appendChild(item);});}
      else {input=document.createElement('input');input.type=type==='boolean'?'checkbox':type==='slider'?'range':type==='number'?'number':'text';if(type==='boolean')input.checked=value===true||String(value)==='true';else input.value=value;for(const key of ['min','max','step'])if(field[key]!=null)input[key]=field[key];}
      input.disabled=!interactive||field.ui?.configurable===false;input.setAttribute('aria-label',label(field));
      let output;
      input.addEventListener('input',()=>{const next=type==='boolean'?input.checked:['number','slider'].includes(type)&&input.value!==''?Number(input.value):input.tagName==='SELECT'?(options(field).find(option=>String(option.value)===input.value)?.value??input.value):input.value;store.set(next);if(output)output.textContent=String(next);updateSummary();});
      if(type==='slider'){const range=document.createElement('div');range.className='workflow-param-range';input.className='smart-range';output=document.createElement('output');output.textContent=String(value);range.append(input,output);row.appendChild(range);}else row.appendChild(input);
      popover.appendChild(row);
    });
    updateSummary();pill.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const open=!wrapper.classList.contains('pinned');closePopovers();if(open)openPopover(wrapper);});return wrapper;
  }
  function visible(field,settings){
    const id=String(field.id||'');
    if(id==='customSize'||id==='customWidth'||id==='customHeight')return settings.resolution==='custom';
    if(id==='customRatio'||id==='customRatioWidth'||id==='customRatioHeight')return settings.ratio==='custom';
    if(id==='ratioMatched')return settings.ratio==='source';
    if(id==='msCustomSize'||id==='msCustomWidth'||id==='msCustomHeight')return settings.msResolution==='custom';
    if(id==='msCustomRatio'||id==='msCustomRatioWidth'||id==='msCustomRatioHeight')return settings.msRatio==='custom';
    if(id==='msRatioMatched')return settings.msRatio==='source';
    return true;
  }
  function isRunningHubTarget(settings){
    if(String(settings?.engine||'').toLowerCase()==='runninghub')return true;
    const index=resourceIndex();const target=resolveStableTarget(settings);
    if(target.resource_id){
      const resource=(index.resources||[]).find(item=>item.id===target.resource_id);
      if(resource)return resource.kind==='runninghub_app';
    }
    const connection=(index.connections||[]).find(item=>item.id===(target.connection_id||settings?.connection_id));
    return connection?.protocol==='runninghub';
  }
  function fallbackFields(values,interactive){
    const settings=values.settings||{};
    if(values.workflow){const note=document.createElement('div');note.className='muted-note';note.textContent='工作流参数加载失败，请重试';return [...workflowSourceControls(values,interactive),note];}
    if(!isRunningHubTarget(settings)&&String(settings.engine||'').toLowerCase()!=='comfy'){
      const kind=settings.apiKind==='video'||settings.videoModel?'video':'image';
      const modelId=kind==='video'?'videoModel':'model';
      const entries=kind==='video'
        ? (typeof apiVideoModelEntries==='function'?apiVideoModelEntries():[])
        : (typeof apiImageModelEntries==='function'?apiImageModelEntries():[]);
      const selected=entries.find(entry=>entry.model===settings[modelId]&&(entry.providerId===(kind==='video'?settings.videoProvider:settings.provider_id)))||entries.find(entry=>entry.model===settings[modelId]);
      const model=selected?.model||settings[modelId]||'';
      const defaults=typeof defaultCanvasParameterSchema==='function'?defaultCanvasParameterSchema(kind).fields:kind==='image'?[
        {id:'resolution',default:'1k',options:['1k','2k','4k','custom']},
        {id:'ratio',default:'1:1',options:['1:1','2:3','3:2','3:4','4:3','9:16','16:9','21:9','9:21','source','custom']},
        {id:'quality',default:'auto',options:['auto','low','medium','high']},
        {id:'count',default:1,min:1,max:4}
      ]:[];
      const names={model:'模型',videoModel:'模型',resolution:'分辨率',ratio:'比例',quality:'质量',count:'数量',videoDuration:'时长',videoAspect:'比例',videoResolution:'分辨率'};
      const fields=[{id:modelId,default:model,options:model?[model]:[],option_labels:[selected?.label||model],ui:{configurable:false}},...defaults];
      return fields.map(field=>schemaField({...field,name:names[field.id]||field.id,type:field.options?'dropdown':'number'},values,values.params.runSettings?'runSettings':'',interactive));
    }
    // These keys are structural/meta or are surfaced elsewhere (prompt box,
    // node connections), so they must never appear as editable param chips
    // even when the schema lookup fails and we fall back to walking params.
    const excludedLeaf=new Set(['runSettingsSchemaVersion','schema_version','prompt','engine','apiKind','genKind','connection_id','model_id','resource_id','rhConfigKey','workflowSource','comfyWorkflow']);
    const excludedName=new Set(['text','prompt','image','video','audio']);
    const excluded=path=>{const leaf=String(path).split('.').pop();return excludedLeaf.has(leaf)||excludedName.has(String(leaf).includes('::')?String(leaf).split('::').pop():leaf);};
    const fields=[];const walk=(object,prefix='')=>Object.entries(object||{}).forEach(([key,value])=>{const path=prefix?`${prefix}.${key}`:key;if(value&&typeof value==='object'&&!Array.isArray(value))walk(value,path);else if(primitive(value)&&!excluded(path))fields.push({id:path,name:key,type:typeof value==='boolean'?'boolean':typeof value==='number'?'number':'text',default:value,ui:{configurable:true}});});walk(values.params);return fields.map(field=>schemaField(field,values,'',interactive));
  }
  async function populateSchema(card,step,values,interactive,request,history=false,promptEl=null){
    const node=step.node||{},settings=values.settings||{};
    const kind=String(settings.apiKind||node.genKind).toLowerCase()==='video'?'video':'image',engine=String(settings.engine||'').toLowerCase();
    const capability=String(node.capability||((node.semantic_type==='prompt'||node.semantic_type==='smart-prompt')?'prompt.generate':(engine==='comfy'?`comfyui.workflow.${kind}`:(engine==='runninghub'||isRunningHubTarget(settings)?`runninghub.app.${kind}`:(kind==='video'?'video.text_to_video':'image.text_to_image')))));
    if(!capability){fallbackFields(values,interactive).forEach(item=>card.querySelector('.canvas-agent-config-controls').appendChild(item));return;}
    try{
      const apiJson=globalThis.__MediaForgeRuntimeServices?.apiJson;
      let schema;
      // Local workflows have a file name as resource_id, not a database target.
      if(values.workflow&&engine==='comfy'&&settings.comfyWorkflow&&typeof ensureComfyWorkflow==='function'){
        const workflow=await ensureComfyWorkflow(settings.comfyWorkflow);schema={params_path:'runSettings.comfyParams',fields:(workflow?.config?.fields||[]).map(field=>({...field,role:field.role||(['prompt','textarea'].includes(field.type)?'prompt':field.type)}))};
        if(!workflow)throw new Error('Workflow not found');
      }else schema=apiJson ? await apiJson(schemaUrl(capability,settings),{credentials:'same-origin'}) : await fetch(schemaUrl(capability,settings),{credentials:'same-origin'}).then(async response=>{if(!response.ok)throw new Error();return response.json();});
      if((request!==schemaRequest&&!history)||!card.isConnected)return;
      if(!Array.isArray(schema?.fields)||(!schema.fields.length&&!values.workflow))throw new Error('Missing parameter schema');
      const paramsPath=String(schema.params_path||'runSettings');const controls=card.querySelector('.canvas-agent-config-controls');
      // A RunningHub app exposes its prompt through a prompt-role field. Mirror
      // the canvas node: surface that text in the top prompt box (and write it
      // back there) instead of rendering a duplicate parameter control.
      const bindPrompt=field=>{if(!promptEl)return;const store=fieldStore(field,values,paramsPath);const stored=pathValue(values.params,`${paramsPath}.${field.id}`);const initial=String((stored&&typeof stored==='object'?stored.value:stored)??(readPrompt(values.params)||store.get())??'');if(initial){promptEl.value=initial;values.content=initial;store.set(initial);writePrompt(values.params,initial);}const handler=()=>{store.set(promptEl.value);writePrompt(values.params,promptEl.value);values.content=promptEl.value;};promptEl.removeEventListener('input',promptEl._agentPromptHandler||(()=>{}));promptEl._agentPromptHandler=handler;promptEl.addEventListener('input',handler);};
      const renderFields=()=>{closePopovers();controls.innerHTML='';
        if(values.workflow){
          workflowSourceControls(values,interactive).forEach(control=>controls.appendChild(control));
          const fields=schema.fields.filter(field=>{const role=String(field.role||field.type||'');if(role==='prompt'){bindPrompt(field);return false;}return !['image','video','audio'].includes(role);});
          if(fields.length)controls.appendChild(workflowParameters(fields,values,paramsPath,interactive));
          window.lucide?.createIcons();return;
        }
        const orderedFields=[...schema.fields].sort((a,b)=>{const order=['model','resolution','ratio','quality','count'];const rank=field=>{const index=order.indexOf(String(field.id));return index<0?order.length:index;};return rank(a)-rank(b);});
        orderedFields
          .filter(field=>!['provider_id','videoProvider'].includes(String(field.id||'')))
          .filter(field=>visible(field,pathValue(values.params,paramsPath)||{}))
          .forEach(field=>{
            const role=String(field.role||field.type||'');
            if(role==='prompt'){bindPrompt(field);return;}
            // Image/video/audio fields are reference inputs supplied by node
            // connections, not editable parameters. Match the canvas node,
            // which excludes them from the parameter panel entirely.
            if(['image','video','audio'].includes(role))return;
            if(['model','videoModel'].includes(String(field.id))){
              const entries=field.id==='videoModel'?(typeof apiVideoModelEntries==='function'?apiVideoModelEntries():[]):(typeof apiImageModelEntries==='function'?apiImageModelEntries():[]);
              field={...field,option_labels:(field.options||[]).map((model,index)=>entries.find(entry=>entry.model===model&&entry.providerId===(field.id==='videoModel'?settings.videoProvider:settings.provider_id))?.label||field.option_labels?.[index]||model)};
            }
            controls.appendChild(schemaField(field,values,paramsPath,interactive,fieldId=>{if(['model','videoModel'].includes(fieldId))void populateSchema(card,step,values,interactive,request,history,promptEl);else if(['resolution','ratio','msResolution','msRatio'].includes(fieldId))renderFields();}));
          });
        window.lucide?.createIcons();};renderFields();
      if(!controls.childElementCount){fallbackFields(values,interactive).forEach(item=>controls.appendChild(item));window.lucide?.createIcons();}
    }catch(_){if((request===schemaRequest||history)&&card.isConnected){const controls=card.querySelector('.canvas-agent-config-controls');controls.replaceChildren(...fallbackFields(values,interactive));window.lucide?.createIcons();}}
  }
  function config(step,interactive,request,withActions=false,history=false,status=''){
    const values=planValues(step);const card=document.createElement('section');card.className=`canvas-agent-node-config composer-card${history?' canvas-agent-node-config-history':''}`;
    const head=document.createElement('div');head.className='canvas-agent-node-config-head composer-head';const heading=document.createElement('h5');heading.textContent=values.title||text(step);head.appendChild(heading);if(status){const badge=document.createElement('span');badge.className='canvas-agent-plan-state';badge.textContent=status;head.appendChild(badge);}card.appendChild(head);
    const promptRow=document.createElement('div');promptRow.className='prompt-row';const content=document.createElement('textarea');content.className='canvas-agent-config-prompt prompt-input';content.value=values.content;content.disabled=!interactive&&!history;content.readOnly=history;content.placeholder='提示词';content.style.setProperty('--prompt-h','124px');if(history){content.classList.add('canvas-agent-history-prompt');content.setAttribute('aria-expanded','false');content.title='点击展开提示词';content.addEventListener('click',()=>{const expanded=content.classList.toggle('expanded');content.setAttribute('aria-expanded',String(expanded));content.title=expanded?'点击收起提示词':'点击展开提示词';});}content.addEventListener('input',()=>{values.content=content.value;writePrompt(values.params,content.value);});promptRow.appendChild(content);card.appendChild(promptRow);
    const controls=document.createElement('div');controls.className='canvas-agent-config-controls dynamic-params param-row';card.appendChild(controls);
    if(withActions&&interactive){const footer=document.createElement('div');footer.className='canvas-agent-confirm-actions';const authorization=document.createElement('label');authorization.className='setting-check';authorization.innerHTML='<input type="checkbox" id="canvasAgentAuthorizeNodes"><span class="check-box"></span><span>允许本轮修改引用的用户节点</span>';authorization.querySelector('input').addEventListener('change',event=>authorization.classList.toggle('active',event.target.checked));footer.appendChild(authorization);const buttons=document.createElement('div');buttons.className='canvas-agent-plan-actions';[['取消',false,'cascade-run-btn','x'],['确认',true,'run-btn','play']].forEach(([caption,approved,klass,icon])=>{const button=document.createElement('button');button.type='button';button.className=`canvas-agent-action ${klass}`;button.textContent=caption;const glyph=document.createElement('i');glyph.setAttribute('data-lucide',icon);button.prepend(glyph);button.addEventListener('click',()=>window.CanvasAgentPanel.confirm(approved));buttons.appendChild(button);});footer.appendChild(buttons);card.appendChild(footer);}
    card._override=()=>step.node?({step_id:values.step_id,title:values.title,content:values.content,params:values.params}):null;void populateSchema(card,step,values,interactive,request,history,content);return card;
  }
  // Execution steps reference the same node; they are operations, not another
  // editable configuration. Keep standalone runs visible for existing nodes.
  function configurationSteps(steps){
    const configurable=new Set(['canvas.create_node','canvas.update_node_params','canvas.replace_node_content','canvas.run_node','canvas.run_group']);
    const target=step=>step.action==='canvas.create_node'?step.id:(step.target_node_id||step.from_step);
    const configured=new Set(steps.filter(step=>step.node&&!['canvas.run_node','canvas.run_group'].includes(step.action)).map(target).filter(Boolean));
    const shownRuns=new Set();
    return steps.filter(step=>{
      if(!step.node&&!configurable.has(step.action))return false;
      if(['canvas.run_node','canvas.run_group'].includes(step.action)){
        const id=target(step);
        if(id&&(configured.has(id)||shownRuns.has(id)))return false;
        if(id)shownRuns.add(id);
      }
      return true;
    });
  }
  function render(row,options={}){
    const box=options.container||document.getElementById('canvasAgentPlan'),interactive=options.interactive!==false,renderKey=`${row?.version||''}:${interactive?'interactive':'readonly'}`;
    if(!options.force&&!options.container&&row&&state.plan?.version===row.version&&box.dataset.planVersion===renderKey)return;
    closePopovers();const request=++schemaRequest;box.innerHTML='';if(!options.container)state.plan=row||null;const plan=row?.content_json||{},steps=Array.isArray(plan.steps)?plan.steps:[];if(!row){box.hidden=true;return;}box.dataset.planVersion=renderKey;
    const title=document.createElement('h4');title.textContent=plan.goal||'Agent 计划';box.appendChild(title);
    const history=Boolean(options.container)||Boolean(options.history);
    const nodeSteps=configurationSteps(steps);const configs=nodeSteps.map((step,index)=>config(step,interactive,request,interactive&&index===nodeSteps.length-1,history,options.status||''));if(configs.length)configs.forEach(item=>box.appendChild(item));else{const summary=document.createElement('div');summary.className='canvas-agent-plan-meta';summary.textContent=steps.map(text).join('；');box.appendChild(summary);}if(!interactive)box.hidden=false;else box.hidden=false;
    window.lucide?.createIcons();
  }
  const collectOverrides=()=>[...document.querySelectorAll('#canvasAgentPlan .canvas-agent-node-config')].map(card=>card._override?.()).filter(Boolean);
  CanvasAgentPlan={render,collectOverrides};
})();
