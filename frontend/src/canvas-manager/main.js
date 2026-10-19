import { apiJson } from '../services/http.js';
import { createIcons } from 'lucide/dist/esm/lucide.mjs';
import Sparkles from 'lucide/dist/esm/icons/sparkles.mjs';
import Layers from 'lucide/dist/esm/icons/layers.mjs';
import Upload from 'lucide/dist/esm/icons/upload.mjs';
import RefreshCw from 'lucide/dist/esm/icons/refresh-cw.mjs';
import Plus from 'lucide/dist/esm/icons/plus.mjs';
import Search from 'lucide/dist/esm/icons/search.mjs';
import ChevronDown from 'lucide/dist/esm/icons/chevron-down.mjs';
import SearchX from 'lucide/dist/esm/icons/search-x.mjs';
import LayoutGrid from 'lucide/dist/esm/icons/layout-grid.mjs';
import Download from 'lucide/dist/esm/icons/download.mjs';
import Archive from 'lucide/dist/esm/icons/archive.mjs';
import Pencil from 'lucide/dist/esm/icons/pencil.mjs';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';
import Trash from 'lucide/dist/esm/icons/trash.mjs';
import CircleAlert from 'lucide/dist/esm/icons/circle-alert.mjs';

applyStoredTheme();

const icons = {
  Sparkles, Layers,
  Upload, RefreshCw, Plus, Search, ChevronDown, SearchX, LayoutGrid, Download, Archive,
  Pencil, Trash, CircleAlert,
  // 页面仍使用旧图标名 layers-3 / trash-2；在 lucide 1.x 中分别是 Layers / Trash 的别名。
  Layers3: Layers, Trash2: Trash,
};
const renderIcons = () => createIcons({ icons });
const list = document.getElementById('canvasList');
const count = document.getElementById('canvasCount');
const form = document.getElementById('createForm');
const titleInput = document.getElementById('canvasTitleInput');
const refreshButton = document.getElementById('refreshBtn');
const importButton = document.getElementById('importBtn');
const importInput = document.getElementById('importInput');
const searchInput = document.getElementById('canvasSearch');
const sortSelect = document.getElementById('canvasSort');
let allCanvases = [];

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const formatTime = value => {
  const date = new Date(Number(value || 0));
  if (Number.isNaN(date.getTime()) || !Number(value)) return '未编辑';
  return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

function render(canvases) {
  allCanvases = canvases.slice();
  const query = (searchInput?.value || '').trim().toLocaleLowerCase('zh-CN');
  const sort = sortSelect?.value || 'updated';
  const visible = canvases
    .filter(canvas => String(canvas.title || '未命名画布').toLocaleLowerCase('zh-CN').includes(query))
    .sort((a, b) => sort === 'title'
      ? String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN')
      : Number(b[sort === 'created' ? 'created_at' : 'updated_at'] || 0) - Number(a[sort === 'created' ? 'created_at' : 'updated_at'] || 0));

  count.textContent = query && visible.length !== canvases.length ? `${visible.length} / ${canvases.length}` : String(visible.length);
  if (!visible.length) {
    list.innerHTML = `<div class="empty-state"><div><i data-lucide="${query ? 'search-x' : 'layout-grid'}"></i><p>${query ? '没有匹配的画布。' : '还没有画布，创建第一张开始创作。'}</p></div></div>`;
    renderIcons();
    return;
  }

  list.innerHTML = visible.map((canvas, index) => {
    const thumbnail = String(canvas.thumbnail_url || '').trim();
    const stage = thumbnail
      ? `<img class="canvas-thumbnail" src="${escapeHtml(thumbnail)}" alt="" loading="lazy" decoding="async">`
      : '<span class="canvas-icon"><i data-lucide="sparkles"></i></span>';
    return `<article class="canvas-card" style="--card-index:${Math.min(index, 8)}"><button class="canvas-open" type="button" data-open-id="${escapeHtml(canvas.id)}" aria-label="打开 ${escapeHtml(canvas.title)}"><div class="canvas-stage ${thumbnail ? 'has-thumbnail' : ''}">${stage}</div><div class="canvas-info"><div class="canvas-title">${escapeHtml(canvas.title || '未命名画布')}</div><div class="canvas-meta">${Number(canvas.node_count || 0)} 个节点 · ${formatTime(canvas.updated_at || canvas.created_at)}</div></div></button><div class="card-actions"><button class="card-action" type="button" data-export-id="${escapeHtml(canvas.id)}" data-title="${escapeHtml(canvas.title || '')}" title="下载画布" aria-label="下载画布"><i data-lucide="download"></i></button><button class="card-action" type="button" data-export-assets-id="${escapeHtml(canvas.id)}" data-title="${escapeHtml(canvas.title || '')}" title="下载画布和资产" aria-label="下载画布和资产"><i data-lucide="archive"></i></button><button class="card-action" type="button" data-rename-id="${escapeHtml(canvas.id)}" data-title="${escapeHtml(canvas.title || '')}" title="重命名"><i data-lucide="pencil"></i></button><button class="card-action danger" type="button" data-delete-id="${escapeHtml(canvas.id)}" data-title="${escapeHtml(canvas.title || '')}" title="删除"><i data-lucide="trash-2"></i></button></div></article>`;
  }).join('');
  list.querySelectorAll('.canvas-thumbnail').forEach(image => image.addEventListener('error', () => {
    image.closest('.canvas-stage')?.classList.add('thumbnail-failed');
    image.remove();
  }, { once: true }));
  renderIcons();
}

async function loadCanvases() {
  list.setAttribute('aria-busy', 'true');
  list.innerHTML = '<div class="loading"><span class="loading-dot"></span>正在加载画布...</div>';
  try {
    const data = await apiJson('/api/canvases');
    render(Array.isArray(data.canvases) ? data.canvases : []);
  } catch {
    count.textContent = '0';
    list.innerHTML = '<div class="empty-state"><div><i data-lucide="circle-alert"></i><p>画布列表加载失败，请刷新后重试。</p></div></div>';
    renderIcons();
  } finally {
    list.removeAttribute('aria-busy');
  }
}

const openCanvas = id => { location.href = `/static/canvas.html?id=${encodeURIComponent(id)}`; };

async function createCanvas(event) {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const data = await apiJson('/api/canvases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleInput.value.trim() || '新建画布', icon: 'sparkles' }),
    });
    if (!data.canvas?.id) throw new Error('missing id');
    openCanvas(data.canvas.id);
  } catch {
    window.alert('创建画布失败，请稍后重试。');
  } finally {
    submit.disabled = false;
  }
}

async function renameCanvas(id, oldTitle) {
  const title = window.prompt('画布名称', oldTitle);
  if (title === null || !title.trim()) return;
  try {
    await apiJson(`/api/canvases/${encodeURIComponent(id)}/meta`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() }),
    });
    loadCanvases();
  } catch {
    window.alert('重命名失败，请稍后重试。');
  }
}

async function deleteCanvas(id, title) {
  if (!window.confirm(`确认永久删除“${title}”？此操作无法恢复。`)) return;
  try {
    await apiJson(`/api/canvases/${encodeURIComponent(id)}`, { method: 'DELETE' });
    loadCanvases();
  } catch {
    window.alert('删除画布失败，请稍后重试。');
  }
}

function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 800);
}

async function exportCanvas(id, title, includeResources = false) {
  try {
    const data = await apiJson(`/api/canvases/${encodeURIComponent(id)}`);
    const canvas = data.canvas || {};
    const payload = { format: 'infinite-canvas-workflow', version: 1, canvas_type: 'smart', exported_at: Date.now(), nodes: canvas.nodes || [], connections: canvas.connections || [] };
    const safe = (title || canvas.title || 'canvas').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'canvas';
    const filename = `${safe}-workflow.${includeResources ? 'zip' : 'json'}`;
    if (!includeResources) { downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename); return; }
    const response = await fetch('/api/canvas-workflows/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, include_resources: true, filename }) });
    if (!response.ok) throw new Error('export failed');
    downloadBlob(await response.blob(), filename);
  } catch { window.alert('导出失败，请稍后重试。'); }
}

async function importCanvas(file) {
  if (!file) return;
  try {
    const formData = new FormData();
    formData.append('file', file);
    const imported = await apiJson('/api/canvas-workflows/import', { method: 'POST', body: formData });
    const sourceNodes = Array.isArray(imported.nodes) ? imported.nodes : [];
    if (!sourceNodes.length) throw new Error('empty workflow');
    const idMap = new Map();
    const nodes = sourceNodes.map((node, index) => {
      const copy = { ...(node || {}) };
      const oldId = String(copy.id || `node-${index}`);
      const newId = `smart_${(crypto.randomUUID?.() || `${Date.now()}_${index}`).replace(/-/g, '').slice(0, 18)}`;
      idMap.set(oldId, newId);
      copy.id = newId;
      return copy;
    });
    const connections = (Array.isArray(imported.connections) ? imported.connections : []).map(connection => ({
      ...connection,
      from: idMap.get(String(connection.from)) || connection.from,
      to: idMap.get(String(connection.to)) || connection.to,
    }));
    const title = (file.name || '导入画布').replace(/\.(json|zip)$/i, '') || '导入画布';
    const created = await apiJson('/api/canvases', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, icon: 'sparkles' }),
    });
    const canvas = created.canvas;
    if (!canvas?.id) throw new Error('missing canvas');
    await apiJson(`/api/canvases/${encodeURIComponent(canvas.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, icon: canvas.icon || 'sparkles', nodes, connections, viewport: { x: 0, y: 0, scale: 1 }, logs: [], settings: {} }),
    });
    loadCanvases();
  } catch {
    window.alert('导入失败，请确认文件是有效的画布模板。');
  } finally {
    importInput.value = '';
  }
}

list.addEventListener('click', event => {
  const open = event.target.closest('[data-open-id]');
  if (open) return openCanvas(open.dataset.openId);
  const exportButton = event.target.closest('[data-export-id]');
  if (exportButton) return exportCanvas(exportButton.dataset.exportId, exportButton.dataset.title);
  const exportAssetsButton = event.target.closest('[data-export-assets-id]');
  if (exportAssetsButton) return exportCanvas(exportAssetsButton.dataset.exportAssetsId, exportAssetsButton.dataset.title, true);
  const rename = event.target.closest('[data-rename-id]');
  if (rename) return renameCanvas(rename.dataset.renameId, rename.dataset.title || '');
  const remove = event.target.closest('[data-delete-id]');
  if (remove) deleteCanvas(remove.dataset.deleteId, remove.dataset.title || '未命名画布');
});
form.addEventListener('submit', createCanvas);
refreshButton.addEventListener('click', loadCanvases);
importButton.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', () => importCanvas(importInput.files?.[0]));
searchInput?.addEventListener('input', () => render(allCanvases));
sortSelect?.addEventListener('change', () => render(allCanvases));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && document.activeElement !== titleInput) {
    event.preventDefault();
    searchInput?.focus();
  }
});
renderIcons();
loadCanvases();
