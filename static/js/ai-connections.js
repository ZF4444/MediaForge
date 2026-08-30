(() => {
  const $ = id => document.getElementById(id);
  const status = text => { $('status').textContent = text || ''; };
  let state = {connections:[], models:[], resources:[]};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const value = (item, key) => esc(item[key] ?? '');
  const options = (selected, values) => values.map(item => `<option value="${item}" ${selected === item ? 'selected' : ''}>${item}</option>`).join('');
  const field = (index, key, item, type='text') => `<input data-index="${index}" data-key="${key}" type="${type}" value="${value(item,key)}">`;
  function render(){
    $('connections').innerHTML = state.connections.map((item,index) => `<div class="row">${field(index,'id',item)}<select data-index="${index}" data-key="protocol">${options(item.protocol,['openai','gemini','omnilojo','runninghub','comfyui','volcengine'])}</select>${field(index,'name',item)}${field(index,'base_url',item)}<label><input class="compact" data-index="${index}" data-key="enabled" type="checkbox" ${item.enabled !== false ? 'checked':''}>启用</label><button class="danger" data-remove="connections" data-index="${index}">删除</button><input data-index="${index}" data-key="api_key" type="password" placeholder="新 API Key（留空不修改）"></div>`).join('') || '<span class="hint">暂无连接</span>';
    $('models').innerHTML = state.models.map((item,index) => `<div class="row model-row">${field(index,'id',item)}<select data-index="${index}" data-key="connection_id">${options(item.connection_id,state.connections.map(c=>c.id))}</select><select data-index="${index}" data-key="kind">${options(item.kind,['chat','image','video'])}</select>${field(index,'upstream_model',item)}${field(index,'alias',item)}<label><input class="compact" data-index="${index}" data-key="enabled" type="checkbox" ${item.enabled !== false ? 'checked':''}>启用</label><button class="danger" data-remove="models" data-index="${index}">删除</button></div>`).join('') || '<span class="hint">暂无模型</span>';
    $('resources').innerHTML = state.resources.map((item,index) => `<div class="row resource-row">${field(index,'id',item)}<select data-index="${index}" data-key="connection_id">${options(item.connection_id,state.connections.map(c=>c.id))}</select><select data-index="${index}" data-key="kind">${options(item.kind,['runninghub_app','comfyui_workflow'])}</select>${field(index,'name',item)}${field(index,'settings_text',{settings_text:JSON.stringify(item.settings||{})})}<label><input class="compact" data-index="${index}" data-key="enabled" type="checkbox" ${item.enabled !== false ? 'checked':''}>启用</label><button class="danger" data-remove="resources" data-index="${index}">删除</button></div>`).join('') || '<span class="hint">暂无执行资源</span>';
  }
  async function load() {
    status('加载中…');
    try {
      const response = await fetch('/api/ai/configuration', {headers:{'Accept':'application/json'}});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || '资源加载失败');
      state = {connections:data.connections || [], models:data.models || [], resources:data.resources || []}; render();
      status(`已加载 ${(data.connections || []).length} 个连接`);
    } catch (error) { status(error.message || '资源加载失败'); }
  }
  $('refresh').addEventListener('click', load);
  document.addEventListener('input', event => {
    const input = event.target, section = input.closest('#connections') ? 'connections' : input.closest('#models') ? 'models' : input.closest('#resources') ? 'resources' : '';
    if (!section || input.dataset.index === undefined) return;
    state[section][Number(input.dataset.index)][input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value;
  });
  document.addEventListener('click', event => { const button=event.target.closest('[data-remove]'); if(button){state[button.dataset.remove].splice(Number(button.dataset.index),1);render();} });
  $('add-connection').addEventListener('click', () => {state.connections.push({id:'',protocol:'openai',name:'',base_url:'',enabled:true,settings:{}});render();});
  $('add-model').addEventListener('click', () => {state.models.push({id:'',connection_id:state.connections[0]?.id||'',kind:'chat',upstream_model:'',protocol:'openai',alias:'',enabled:true,capabilities:[]});render();});
  $('add-resource').addEventListener('click', () => {state.resources.push({id:'',connection_id:state.connections[0]?.id||'',kind:'runninghub_app',name:'',enabled:true,settings:{}});render();});
  $('save').addEventListener('click', async () => {
    status('保存中…');
    try {
      state.resources.forEach(item => {item.settings=JSON.parse(item.settings_text||JSON.stringify(item.settings||{}));delete item.settings_text;});
      const response = await fetch('/api/ai/configuration', {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || '保存失败');
      status('保存完成'); await load();
    } catch (error) { status(error.message || '保存失败'); }
  });
  load();
})();
