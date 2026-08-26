(function(){
  const state=window.CanvasAgentState;
  let schemaRequest=0;
  const clone=value=>JSON.parse(JSON.stringify(value||{}));
  const text=step=>step.description||step.node?.title||step.action||'执行画布操作';
  const pathValue=(value,path)=>String(path||'').split('.').filter(Boolean).reduce((item,key)=>item&&typeof item==='object'?item[key]:undefined,value);
  const setPath=(target,path,value)=>{const keys=String(path||'').split('.').filter(Boolean);let cursor=target;keys.slice(0,-1).forEach(key=>cursor=cursor[key]||={});if(keys.length)cursor[keys.at(-1)]=value;};
  const primitive=value=>['string','number','boolean'].includes(typeof value);
  const schemaUrl=(capability,provider,model)=>`/api/canvas/capability-parameters?${new URLSearchParams({capability,provider_id:provider,model}).toString()}`;
  function planValues(step){
    const node=step.node||{},params=clone(node.params);
    return {step_id:step.id,title:node.title||'',content:node.content||'',params,settings:params.runSettings||params};
  }
  function label(field){return String(field.display_name||field.name||field.id||'参数');}
  function options(field){
    const values=Array.isArray(field.display_options)?field.display_options:[];
    if(values.length)return values;
    const labels=Array.isArray(field.option_labels)?field.option_labels:[];
    return (field.options||[]).map((value,index)=>({value,label:String(labels[index]||value)}));
  }
  function control(field,value,onChange,interactive){
    const type=String(field.type||'text'); const configurable=interactive&&field.ui?.configurable!==false;
    if(type==='dropdown'){
      const select=document.createElement('select'); options(field).forEach(option=>{const item=document.createElement('option');item.value=String(option.value);item.textContent=String(option.label);select.appendChild(item);});select.value=value==null?'':String(value);select.disabled=!configurable;select.addEventListener('change',()=>onChange(select.value));return select;
    }
    if(type==='boolean'){
      const input=document.createElement('input');input.type='checkbox';input.checked=Boolean(value);input.disabled=!configurable;input.addEventListener('change',()=>onChange(input.checked));return input;
    }
    const input=document.createElement(type==='textarea'?'textarea':'input');
    if(type==='number'||type==='slider'){input.type='number';if(field.min!=null)input.min=field.min;if(field.max!=null)input.max=field.max;if(field.step!=null)input.step=field.step;}
    input.value=value??'';input.disabled=!configurable;if(type==='textarea')input.rows=2;input.addEventListener('input',()=>onChange((type==='number'||type==='slider')&&input.value!==''?Number(input.value):input.value));return input;
  }
  function schemaField(field,values,paramsPath,interactive,onLayoutChange){
    const row=document.createElement('label');row.className='canvas-agent-config-control';const caption=document.createElement('span');caption.textContent=label(field);
    const value=pathValue(values.params,`${paramsPath}.${field.id}`)??field.default??'';
    row.append(caption,control(field,value,next=>{setPath(values.params,`${paramsPath}.${field.id}`,next);if(['resolution','ratio','msResolution','msRatio'].includes(String(field.id)))onLayoutChange?.();},interactive));return row;
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
  function fallbackFields(values,interactive){
    const fields=[];const walk=(object,prefix='')=>Object.entries(object||{}).forEach(([key,value])=>{const path=prefix?`${prefix}.${key}`:key;if(value&&typeof value==='object'&&!Array.isArray(value))walk(value,path);else if(primitive(value))fields.push({id:path,name:path,type:typeof value==='boolean'?'boolean':typeof value==='number'?'number':'text',default:value,ui:{configurable:true}});});walk(values.params);return fields.map(field=>schemaField(field,values,'',interactive));
  }
  async function populateSchema(card,step,values,interactive,request){
    const node=step.node||{},settings=values.settings||{};const provider=String(settings.provider_id||settings.videoProvider||'');const model=String(settings.model||settings.videoModel||'');
    if(!node.capability){fallbackFields(values,interactive).forEach(item=>card.querySelector('.canvas-agent-config-controls').appendChild(item));return;}
    try{
      const response=await fetch(schemaUrl(node.capability,provider,model),{credentials:'same-origin'});if(!response.ok)throw new Error();const schema=await response.json();if(request!==schemaRequest||!card.isConnected)return;
      const paramsPath=String(schema.params_path||'runSettings');const controls=card.querySelector('.canvas-agent-config-controls');const renderFields=()=>{controls.innerHTML='';(schema.fields||[]).filter(field=>visible(field,pathValue(values.params,paramsPath)||{})).forEach(field=>controls.appendChild(schemaField(field,values,paramsPath,interactive,renderFields)));};renderFields();
      if(!controls.childElementCount)fallbackFields(values,interactive).forEach(item=>controls.appendChild(item));
    }catch(_){if(request===schemaRequest&&card.isConnected)fallbackFields(values,interactive).forEach(item=>card.querySelector('.canvas-agent-config-controls').appendChild(item));}
  }
  function config(step,interactive,request){
    const values=planValues(step);const card=document.createElement('section');card.className='canvas-agent-node-config';
    const head=document.createElement('div');head.className='canvas-agent-node-config-head';const heading=document.createElement('h5');heading.textContent=values.title||text(step);head.appendChild(heading);card.appendChild(head);
    const content=document.createElement('textarea');content.className='canvas-agent-config-prompt';content.rows=2;content.value=values.content;content.disabled=!interactive;content.placeholder='提示词';content.addEventListener('input',()=>values.content=content.value);card.appendChild(content);
    const controls=document.createElement('div');controls.className='canvas-agent-config-controls';card.appendChild(controls);card._override=()=>({step_id:values.step_id,title:values.title,content:values.content,params:values.params});void populateSchema(card,step,values,interactive,request);return card;
  }
  function render(row,options={}){
    const box=document.getElementById('canvasAgentPlan'),interactive=options.interactive!==false,renderKey=`${row?.version||''}:${interactive?'interactive':'readonly'}`;
    if(row&&state.plan?.version===row.version&&box.dataset.planVersion===renderKey)return;
    const request=++schemaRequest;box.innerHTML='';state.plan=row||null;const plan=row?.content_json||{},steps=Array.isArray(plan.steps)?plan.steps:[];if(!row){box.hidden=true;return;}box.dataset.planVersion=renderKey;
    const title=document.createElement('h4');title.textContent=plan.goal||'Agent 计划';box.appendChild(title);
    const configs=steps.filter(step=>step.node).map(step=>config(step,interactive,request));if(configs.length)configs.forEach(item=>box.appendChild(item));else{const summary=document.createElement('div');summary.className='canvas-agent-plan-meta';summary.textContent=steps.map(text).join('；');box.appendChild(summary);}
    if(!interactive){box.hidden=false;return;}const authorization=document.createElement('label');authorization.className='canvas-agent-plan-meta';authorization.innerHTML='<input type="checkbox" id="canvasAgentAuthorizeNodes"> 允许本轮修改引用的用户节点';box.appendChild(authorization);
    const actions=document.createElement('div');actions.className='canvas-agent-plan-actions';[['取消',false,'secondary'],['确认执行',true,'primary']].forEach(([caption,approved,klass])=>{const button=document.createElement('button');button.type='button';button.className=`canvas-agent-action ${klass}`;button.textContent=caption;button.addEventListener('click',()=>window.CanvasAgentPanel.confirm(approved));actions.appendChild(button);});box.appendChild(actions);box.hidden=false;
  }
  const collectOverrides=()=>[...document.querySelectorAll('#canvasAgentPlan .canvas-agent-node-config')].map(card=>card._override?.()).filter(Boolean);
  window.CanvasAgentPlan={render,collectOverrides};
})();
