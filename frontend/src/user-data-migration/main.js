import { apiJson } from '../services/http.js';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';

applyStoredTheme();

const sourceInput = document.getElementById('username');
const lookupButton = document.getElementById('lookup');
const statusElement = document.getElementById('status');
const listElement = document.getElementById('list');
const confirmElement = document.getElementById('confirm');
const confirmationInput = document.getElementById('check');
const executeButton = document.getElementById('execute');

let source = null;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

function setStatus(message) {
    statusElement.textContent = message || '';
}

function renderSource(data) {
    source = data.source;
    listElement.innerHTML = `<p>账号：${escapeHtml(source.username)}（${escapeHtml(source.user_id)}）</p>${
        (data.canvases || []).map(canvas => `<div class="canvas"><strong>${escapeHtml(canvas.title || '未命名画布')}</strong><span>${new Date(Number(canvas.updated_at || canvas.created_at || 0)).toLocaleString()}</span></div>`).join('') || '<p>该账号没有画布。</p>'
    }`;
    confirmElement.hidden = false;
    setStatus('请确认画布列表后继续。');
}

lookupButton.addEventListener('click', async () => {
    setStatus('查询中...');
    listElement.innerHTML = '';
    confirmElement.hidden = true;
    source = null;
    try {
        renderSource(await apiJson(`/api/user-data-migration/source?username=${encodeURIComponent(sourceInput.value)}`));
    } catch (error) {
        setStatus(error.message);
    }
});

confirmationInput.addEventListener('change', () => {
    executeButton.disabled = !confirmationInput.checked;
});

executeButton.addEventListener('click', async () => {
    if (!source || !window.confirm(`迁移完成后账号 ${source.username} 将被删除，确定继续吗？`)) return;
    executeButton.disabled = true;
    setStatus('迁移中...');
    try {
        await apiJson('/api/user-data-migration/execute', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({source_user_id: source.user_id, confirmed: true}),
        });
        const message = `迁移完成，账号 ${source.username} 已删除。`;
        setStatus(message);
        confirmElement.hidden = true;
        confirmationInput.checked = false;
        source = null;
        window.alert(message);
    } catch (error) {
        setStatus(error.message);
        executeButton.disabled = false;
    }
});
