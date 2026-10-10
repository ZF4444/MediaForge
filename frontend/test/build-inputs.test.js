import { describe, expect, it } from 'vitest';
import { moduleInputs, modulePages, pages } from '../vite.config.js';
import { resolve } from 'node:path';

describe('production page inputs', () => {
  it('uses HTML inputs for every module page with an HTML source', () => {
    for (const { page, htmlSrc } of pages) {
      if (htmlSrc && modulePages.has(page)) {
        expect(moduleInputs[page]).toBe(resolve('..', htmlSrc));
      }
    }
  });
});
