// api-settings 页面 —— 即梦（Jimeng）CLI 登录子系统（拆分自 static/js/api-settings.js）。
//
// 范围：即梦 CLI 的登录/登出/余额查询整套流程——展示登录二维码
// （renderJimengLoginBox）、轮询登录状态（pollJimengLogin，配合
// jimengLoginTimer 定时器）、查询余额（refreshJimengCredit，从原始
// 响应里提取所有"看起来像余额"的字段，jimengCreditText 是这个提取
// 逻辑）、退出登录（logoutJimeng）、CLI 帮助文档弹层
// （openJimengHelp/closeJimengHelp/loadJimengHelp）。
//
// jimengLoginTimer 这个定时器 id 状态只在本模块内部使用（setInterval 里
// 轮询登录状态用），跟本模块的函数一起搬过来，不留在 main.js——跟核心
// 共享状态（providers/selectedId 等）性质不同，这个纯粹是本子系统的
// 内部实现细节。
//
// 经典 <script>，非 ES module，原因同 rh-workflow-editor.js（本模块的
// openJimengHelp/closeJimengHelp/startJimengLogin/refreshJimengCredit/
// logoutJimeng 等都被 api-settings.html 的内联 onclick 属性直接引用）。
//
// 依赖 main.js 保留的通用工具：escapeHtml/prettyJson（prettyJson 用于把
// CLI 原始 JSON 响应格式化展示）、refreshIcons。DOM 元素引用
// （jimengCliPanel/jimengCliStatus/jimengCredit/jimengLoginBox/
// jimengHelpOverlay/jimengHelpCommand/jimengHelpOutput）是 main.js 顶部
// const 声明的共享 DOM 引用，不重复声明。

function jimengCreditText(raw){
    if(!raw) return '';
    const parts = [];
    const seen = new Set();
    const visit = value => {
        if(!value || typeof value !== 'object') return;
        Object.entries(value).forEach(([key, item]) => {
            const low = key.toLowerCase();
            if(/credit|balance|quota|point|coin|积分|余额/.test(low) && item !== null && typeof item !== 'object'){
                const label = `${key}: ${item}`;
                if(!seen.has(label)){ seen.add(label); parts.push(label); }
            }
            if(item && typeof item === 'object') visit(item);
        });
    };
    visit(raw);
    return parts.join(' · ') || prettyJson(raw);
}
function setJimengStatus(text, ok=null){
    if(!jimengCliStatus) return;
    jimengCliStatus.textContent = text || '未检测';
    jimengCliStatus.classList.toggle('ok', ok === true);
    jimengCliStatus.classList.toggle('bad', ok === false);
}
function renderJimengLoginBox(data){
    if(!jimengLoginBox) return;
    const text = data?.text || '';
    const qrUrl = data?.qr_url || '';
    const qrHtml = qrUrl && qrUrl.startsWith('http')
        ? `<img class="jimeng-qr-img" src="${escapeHtml(qrUrl)}" alt="即梦登录二维码">`
        : '';
    jimengLoginBox.hidden = false;
    jimengLoginBox.innerHTML = `${qrHtml}<pre>${escapeHtml(text || '等待 CLI 输出登录二维码...')}</pre>`;
}
let jimengLoginTimer = null;
async function refreshJimengStatus(showCredit=true){
    if(!jimengCliPanel || jimengCliPanel.hidden) return;
    setJimengStatus('检测中...');
    try {
        const data = await fetch('/api/jimeng/status').then(r => r.json());
        setJimengStatus(data.logged_in ? '已登录' : (data.installed ? '未登录' : '未安装'), data.logged_in === true);
        if(data.installed && data.version_ok === false && jimengCredit){
            jimengCredit.textContent = `⚠ 检测到 dreamina CLI 版本 ${data.cli_version || '未知'}，低于推荐的 ${data.min_version || '1.4.2'}。旧版本任务状态可能无法更新，请升级 CLI。`;
        } else if(showCredit && data.raw && jimengCredit){
            jimengCredit.textContent = jimengCreditText(data.raw);
        }
    } catch(e){
        setJimengStatus('检测失败', false);
        if(jimengCredit) jimengCredit.textContent = e.message || String(e);
    }
}
async function startJimengLogin(){
    setJimengStatus('等待扫码...');
    if(jimengCredit) jimengCredit.textContent = '';
    try {
        const data = await fetch('/api/jimeng/login/start', {method:'POST'}).then(async r => {
            const json = await r.json();
            if(!r.ok) throw new Error(json.detail || '启动登录失败');
            return json;
        });
        renderJimengLoginBox(data);
        clearInterval(jimengLoginTimer);
        jimengLoginTimer = setInterval(pollJimengLogin, 2500);
        refreshIcons();
    } catch(e){
        setJimengStatus('登录失败', false);
        if(jimengLoginBox){
            jimengLoginBox.hidden = false;
            jimengLoginBox.innerHTML = `<pre>${escapeHtml(e.message || String(e))}</pre>`;
        }
    }
}
async function pollJimengLogin(){
    try {
        const data = await fetch('/api/jimeng/login/status').then(r => r.json());
        renderJimengLoginBox(data);
        if(data.logged_in){
            clearInterval(jimengLoginTimer);
            setJimengStatus('已登录', true);
            if(jimengCredit) jimengCredit.textContent = jimengCreditText(data.raw);
        } else if(data.running){
            setJimengStatus('等待扫码...');
        } else {
            setJimengStatus('未登录', false);
        }
    } catch(e){
        clearInterval(jimengLoginTimer);
        setJimengStatus('登录检测失败', false);
    }
}
async function refreshJimengCredit(){
    setJimengStatus('查询余额...');
    try {
        const data = await fetch('/api/jimeng/credit').then(async r => {
            const json = await r.json();
            if(!r.ok) throw new Error(json.detail || '查询余额失败');
            return json;
        });
        setJimengStatus('已登录', true);
        if(jimengCredit) jimengCredit.textContent = jimengCreditText(data.raw);
    } catch(e){
        setJimengStatus('未登录', false);
        if(jimengCredit) jimengCredit.textContent = e.message || String(e);
    }
}
async function logoutJimeng(){
    if(!confirm('确认退出即梦 CLI 登录？')) return;
    try {
        const data = await fetch('/api/jimeng/logout', {method:'POST'}).then(async r => {
            const json = await r.json();
            if(!r.ok) throw new Error(json.detail || '退出登录失败');
            return json;
        });
        setJimengStatus('已退出', false);
        if(jimengCredit) jimengCredit.textContent = prettyJson(data.raw);
        if(jimengLoginBox) jimengLoginBox.hidden = true;
    } catch(e){
        setJimengStatus('退出失败', false);
        if(jimengCredit) jimengCredit.textContent = e.message || String(e);
    }
}
function openJimengHelp(){
    if(!jimengHelpOverlay) return;
    jimengHelpOverlay.style.display = 'flex';
    loadJimengHelp();
}
function closeJimengHelp(){
    if(jimengHelpOverlay) jimengHelpOverlay.style.display = 'none';
}
async function loadJimengHelp(){
    if(!jimengHelpOutput) return;
    jimengHelpOutput.textContent = '加载中...';
    try {
        const command = jimengHelpCommand?.value || '';
        const data = await fetch('/api/jimeng/help', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({command})
        }).then(async r => {
            const json = await r.json();
            if(!r.ok) throw new Error(json.detail || '加载帮助失败');
            return json;
        });
        jimengHelpOutput.textContent = data.text || prettyJson(data.raw);
    } catch(e){
        jimengHelpOutput.textContent = e.message || String(e);
    }
}
