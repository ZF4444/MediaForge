#!/usr/bin/env node
import { buildFrontend, modulePages } from '../vite.config.js';

await buildFrontend();
console.log(`[build:modules] bundled ${modulePages.size} pages with Vite`);
