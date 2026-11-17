import { listLinks, bindSource, issueLink, revokeLink, listPolicies, savePolicy, revokeScope } from '../services/public-video-links.js';
import { applyStoredTheme } from '../shared/theme-bootstrap.js';
import '../styles/theme.css';
import '../pages/public-video-links/page.css';

applyStoredTheme();
const $ = id => document.getElementById(id);
let offset = 0;
let loading = false;
const bytes = value => `${(Number(value || 0) / 1048576).toFixed(1)} MiB`;
const time = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const states = { active: '有效', expired: '已过期', revoked: '已撤销' };
function status(message, error = false) { $('status').textContent = message; $('status').dataset.error = String(error); }
function cell(row, text, secondary) {
  const td = row.insertCell();
  const line = document.createElement('div'); line.textContent = text; td.append(line);
  if (secondary !== undefined) { const sub = document.createElement('div'); sub.className = 'secondary'; sub.textContent = secondary; td.append(sub); }
  return td;
}
async function perform(work) {
  if (loading) return;
  loading = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try { await work(); } catch (error) { status(error.message || '操作失败，请重试', true); }
  finally { loading = false; document.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
}
function reveal(result) { $('one-time-url').value = result.url; $('copy-status').textContent = ''; $('link-dialog').showModal(); }
function clearLink() { $('one-time-url').value = ''; $('copy-status').textContent = ''; if ($('link-dialog').open) $('link-dialog').close(); }
async function refresh() {
  const data = await listLinks(offset, $('state').value);
  $('records').replaceChildren(); $('total').textContent = `共 ${data.total} 条`;
  $('page-info').textContent = `${offset + (data.total ? 1 : 0)}–${Math.min(offset + data.items.length, data.total)} / ${data.total}`;
  $('previous').hidden = offset === 0; $('next').hidden = offset + 30 >= data.total;
  if (!data.items.length) { const row = document.createElement('tr'); const td = cell(row, '暂无授权记录'); td.colSpan = 5; $('records').append(row); }
  for (const item of data.items) {
    const row = document.createElement('tr');
    cell(row, item.file_id, `任务 ${item.task_id}`); cell(row, item.owner_id, item.provider_id);
    const state = cell(row, '', time(item.expires_at)); const badge = document.createElement('span'); badge.className = `badge ${item.state}`; badge.textContent = states[item.state] || item.state; state.firstChild.append(badge);
    cell(row, `已发送 ${bytes(item.bytes_sent)}`, `预扣 ${bytes(item.reserved_bytes)} · GET ${item.get_count} / HEAD ${item.head_count}`);
    const actions = row.insertCell();
    if (item.state === 'active') {
      if (item.owner_id === data.viewer_id) { const rotate = document.createElement('button'); rotate.textContent = '轮换'; rotate.onclick = () => perform(async () => {
        if (!confirm('轮换会作废旧链接，可能影响已提交任务。继续轮换？')) return;
        const result = await issueLink(item.source_id, true); await refresh(); reveal(result);
      }); actions.append(rotate); }
      const revoke = document.createElement('button'); revoke.className = 'danger'; revoke.textContent = '撤销'; revoke.onclick = () => perform(async () => {
        if (!confirm('撤销后供应商将无法发起新的下载请求。继续？')) return;
        await revokeLink(item.id); await refresh(); status('授权已撤销');
      }); actions.append(revoke);
    } else actions.textContent = '—';
    $('records').append(row);
  }
  $('admin-panel').hidden = !data.is_admin;
  if (data.is_admin) {
    const policies = await listPolicies(); $('policies').replaceChildren();
    for (const policy of policies.items) { const row = document.createElement('tr'); cell(row, policy.scope); cell(row, policy.key); cell(row, policy.enabled ? '启用' : '禁用'); cell(row, `${bytes(policy.daily_bytes)} / ${bytes(policy.used_bytes)}`, `UTC ${policy.window_date}`); cell(row, bytes(policy.active_bytes)); $('policies').append(row); }
  }
  status('列表已更新');
}
$('create-form').onsubmit = event => { event.preventDefault(); perform(async () => {
  const values = new FormData(event.target);
  const source = await bindSource(Object.fromEntries(['file_id', 'task_id', 'provider_id'].map(key => [key, String(values.get(key)).trim()])));
  const result = await issueLink(source.id, false, Number(values.get('ttl'))); await refresh(); reveal(result);
}); };
$('policy-form').elements.scope.onchange = event => {
  const key = $('policy-form').elements.key;
  key.value = event.target.value === 'global' ? '*' : '';
  key.readOnly = event.target.value === 'global';
};
$('policy-form').elements.key.readOnly = true;
$('policy-form').onsubmit = event => { event.preventDefault(); perform(async () => {
  const values = new FormData(event.target); const enabled = values.has('enabled');
  if (!enabled && !confirm('禁用会撤销此范围内所有活动链接。继续？')) return;
  await savePolicy({ scope: values.get('scope'), key: String(values.get('key')).trim(), enabled,
    daily_bytes: Number(values.get('daily')) * 1048576, active_bytes: Number(values.get('active')) * 1048576 });
  await refresh(); status('策略已保存');
}); };
$('batch-revoke').onclick = () => perform(async () => {
  const form = $('policy-form'); if (!form.reportValidity()) return;
  const values = new FormData(form); if (values.get('scope') === 'global') throw new Error('批量撤销须限定任务或文件；全局请使用禁用策略。');
  if (!confirm('撤销该范围内所有链接，并阻止新签发，直到管理员重新启用。继续？')) return;
  await revokeScope({ scope: values.get('scope'), key: String(values.get('key')).trim() }); await refresh(); status('范围已撤销');
});
$('refresh').onclick = () => perform(refresh);
$('state').onchange = () => { offset = 0; perform(refresh); };
$('previous').onclick = () => { offset = Math.max(0, offset - 30); perform(refresh); };
$('next').onclick = () => { offset += 30; perform(refresh); };
$('close-dialog').onclick = clearLink;
$('link-dialog').addEventListener('close', clearLink);
$('copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('one-time-url').value); $('copy-status').textContent = '已复制'; } catch { $('copy-status').textContent = '无法自动复制，请选中地址手动复制'; } };
window.addEventListener('pagehide', clearLink);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearLink(); });
perform(refresh);
