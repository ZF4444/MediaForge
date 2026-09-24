import './embed.css';
import './standalone-shim.js';

const statusEl = document.getElementById('status');
const host = document.getElementById('host');

const showError = error => {
    if (statusEl?.style.display === 'none') return;
    if (statusEl) {
        statusEl.className = 'error';
        statusEl.textContent = `VNCCS 姿势工作室加载失败：${error?.message || error || '未知错误'}`;
    }
};

window.addEventListener('vnccs-standalone-ready', event => {
    const node = event.detail?.node;
    const container = node?.studioWidget?.container;
    if (!container || !host) return;
    host.appendChild(container);
    if (statusEl) statusEl.style.display = 'none';
    const resize = () => {
        try {
            node.size = [host.clientWidth || 1200, host.clientHeight || 820];
            node.onResize?.(node.size);
        } catch (error) {
            showError(error);
        }
    };
    new ResizeObserver(resize).observe(host);
    setTimeout(resize, 100);
    setTimeout(resize, 900);
});
window.addEventListener('vnccs-standalone-error', event => showError(event.detail?.error));
window.addEventListener('error', event => showError(event.error || event.message));

import('virtual:vnccs-pose-studio').catch(showError);
