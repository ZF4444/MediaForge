import 'virtual:mediaforge-i18n';
import 'virtual:mediaforge-theme';
import * as canvasActions from 'virtual:canvas-features';
import { mountActionDelegation } from '../components/workflow-cover-picker.js';

const root = document.querySelector('[data-canvas-root]') || document;
// 捕获阶段分发 click：画布里多个弹窗/面板会 stopPropagation()，冒泡阶段收不到其内部按钮的点击。
mountActionDelegation(root, Object.fromEntries(Object.entries(canvasActions).map(([name, handler]) => [name, (...args) => handler(...args.slice(0, -1))])), { capture: true });
