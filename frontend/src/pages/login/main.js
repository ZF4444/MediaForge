import { apiJson } from '../../services/http.js';
import '../../styles/login.css';
import '../../styles/theme.css';

try {
    const theme = localStorage.getItem('studio_theme') || localStorage.getItem('canvas_theme') || 'dark';
    if (theme === 'dark') document.documentElement.classList.add('studio-theme-dark', 'theme-dark');
} catch {}

const form = document.getElementById('authForm');
const input = document.getElementById('username');
const message = document.getElementById('msg');
const submitButton = document.getElementById('submitBtn');

document.getElementById('tabLogin')?.addEventListener('click', () => input?.focus());

form?.addEventListener('submit', async event => {
    event.preventDefault();
    const username = input.value.trim();
    message.textContent = '';
    message.className = 'msg';

    if (!username) {
        message.textContent = '请输入用户名。';
        message.classList.add('error');
        input.focus();
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = '登录中…';
    try {
        await apiJson('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        });
        window.location.href = '/';
    } catch (error) {
        message.textContent = error.message.startsWith('操作失败')
            ? '登录失败，请重试。'
            : error.message;
        message.classList.add('error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '登录';
    }
});
