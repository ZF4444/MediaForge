(function(){
  const state=window.CanvasAgentState;
  const labels={title:'节点名称',content:'提示词',provider_id:'平台',model:'模型',resolution:'分辨率',ratio:'比例',quality:'质量',count:'生成数量',videoDuration:'时长',videoAspect:'视频比例',videoResolution:'视频分辨率'};
  const label=path=>labels[path.split('.').at(-1)]||path;
  const clone=value=>JSON.parse(JSON.stringify(value||{}));
  const setPath=(target,path,value)=>{const keys=path.split('.');let cursor=target;keys.slice(0,-1).forEach(key=>cursor=cursor[key]||={});cursor[keys.at(-1)]=value;};
  const leaves=(value,prefix='')=>Object.entries(value||{}).flatMap(([key,item])=>item&&typeof item==='object'&&!Array.isArray(item)?leaves(item,prefix?`${prefix}.${key}`:key):[{path:prefix?`${prefix}.${key}`:key,value:item}]);
  const text=step=>step.description||step.node?.title||step.action||'执行画布操作';
  const parse=(value,initial)=>typeof initial==='number'?Number(value):typeof initial==='boolean'?value==='true':value;
  const field=(name,value,onChange,multiline=false)=>{const row=document.createElement('label');row.className='canvas-agent-config-field';const caption=document.createElement('span');caption.textContent=label(name);const input=document.createElement(multiline?'textarea':'input');input.value=value??'';input.rows=multiline?3:1;input.addEventListener('input',()=>onChange(input.value));row.append(caption,input);return row;};
  function config(step,interactive){
    const node=step.node,values={title:node.title||'',content:node.content||'',params:clone(node.params)};
    const card=document.createElement('section');card.className='canvas-agent-node-config';const heading=document.createElement('h5');heading.textContent=node.title||text(step);card.appendChild(heading);
    const fields=document.createElement('div');fields.className='canvas-agent-config-fields';fields.append(field('title',values.title,value=>values.title=value));fields.append(field('content',values.content,value=>values.content=value,true));
    leaves(values.params).forEach(({path,value})=>{if(['string','number','boolean'].includes(typeof value))fields.append(field(path,value,next=>setPath(values.params,path,parse(next,value))));});
    if(!interactive)fields.querySelectorAll('input,textarea').forEach(input=>input.disabled=true);card.appendChild(fields);card._override=()=>({step_id:step.id,title:values.title,content:values.content,params:values.params});return card;
  }
  function render(row,options={}){
    const box=document.getElementById('canvasAgentPlan'),interactive=options.interactive!==false,renderKey=`${row?.version||''}:${interactive?'interactive':'readonly'}`;
    if(row&&state.plan?.version===row.version&&box.dataset.planVersion===renderKey)return;
    box.innerHTML='';state.plan=row||null;const plan=row?.content_json||{},steps=Array.isArray(plan.steps)?plan.steps:[];if(!row){box.hidden=true;return;}box.dataset.planVersion=renderKey;
    const title=document.createElement('h4');title.textContent=plan.goal||'Agent 计划';box.appendChild(title);
    const configs=steps.filter(step=>step.node).map(step=>config(step,interactive));if(configs.length)configs.forEach(item=>box.appendChild(item));else{const summary=document.createElement('div');summary.className='canvas-agent-plan-meta';summary.textContent=steps.map(text).join('；');box.appendChild(summary);}
    if(interactive&&Array.isArray(plan.questions)&&plan.questions.length)plan.questions.forEach(question=>{const form=document.createElement('div');form.className='canvas-agent-question';const input=document.createElement('input');input.placeholder=question;const button=document.createElement('button');button.className='canvas-agent-action primary';button.type='button';button.textContent='回答';button.addEventListener('click',()=>window.CanvasAgentPanel.answer(input.value));form.append(input,button);box.appendChild(form);});
    if(!interactive){box.hidden=false;return;}const authorization=document.createElement('label');authorization.className='canvas-agent-plan-meta';authorization.innerHTML='<input type="checkbox" id="canvasAgentAuthorizeNodes"> 允许本轮修改引用的用户节点';box.appendChild(authorization);
    const actions=document.createElement('div');actions.className='canvas-agent-plan-actions';[['取消',false,'secondary'],['确认执行',true,'primary']].forEach(([caption,approved,klass])=>{const button=document.createElement('button');button.type='button';button.className=`canvas-agent-action ${klass}`;button.textContent=caption;button.addEventListener('click',()=>window.CanvasAgentPanel.confirm(approved));actions.appendChild(button);});box.appendChild(actions);box.hidden=false;
  }
  const collectOverrides=()=>[...document.querySelectorAll('#canvasAgentPlan .canvas-agent-node-config')].map(card=>card._override?.()).filter(Boolean);
  window.CanvasAgentPlan={render,collectOverrides};
})();
