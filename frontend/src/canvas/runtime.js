import 'virtual:mediaforge-i18n';
import 'virtual:mediaforge-theme';
import * as canvasActions from 'virtual:canvas-features';
import { mountActionDelegation } from '../components/workflow-cover-picker.js';

const root = document.querySelector('[data-canvas-root]') || document;
mountActionDelegation(root, Object.fromEntries(Object.entries(canvasActions).map(([name, handler]) => [name, (...args) => handler(...args.slice(0, -1))])));
mountActionDelegation(root, Object.fromEntries(Object.entries(canvasActions).map(([name, handler]) => [name, (...args) => handler(...args.slice(0, -1))])), { event: 'dblclick' });
