import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';

it('converts a shared API budget error into the canvas budget notification signal', async () => {
  const source = await readFile(new URL('../src/canvas/cascade-run.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function canvasApiJson('), source.indexOf('function canvasApiForm('));
  const detail = { error_code: 'usage_budget_exceeded', message: '个人本月 USD 预算已用尽' };
  const apiJson = vi.fn().mockRejectedValue(Object.assign(new Error('[object Object]'), { data: { detail }, status: 429 }));
  class BudgetSignal extends Error { constructor(value) { super(value.message); this.usageBudgetExceeded = true; } }
  const request = new Function('globalThis', 'budgetDataFromPayload', 'UsageBudgetSignal', `${body}; return canvasApiJson;`)(
    { __MediaForgeRuntimeServices: { apiJson } }, payload => payload.detail, BudgetSignal,
  );
  const error = await request('/api/canvas-video').catch(error => error);
  expect(error.usageBudgetExceeded).toBe(true);
  expect(error.message).toBe(detail.message);
});

it('preserves storage quota details through both JSON and form requests', async () => {
  const source = await readFile(new URL('../src/canvas/cascade-run.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('function canvasApiJson('), source.indexOf('function canvasApiBlob('));
  const data = { error: 'storage_quota_exceeded', detail: '存储空间不足', quota_bytes: 100, used_bytes: 95, incoming_bytes: 20 };
  const fail = vi.fn().mockRejectedValue(Object.assign(new Error(data.detail), { status: 413, data }));
  class QuotaSignal extends Error { constructor(value) { super(value.detail); Object.assign(this, value, { storageQuotaExceeded: true }); } }
  const requests = new Function('globalThis', 'quotaDataFromPayload', 'StorageQuotaSignal', `${body}; return [canvasApiJson, canvasApiForm];`)(
    { __MediaForgeRuntimeServices: { apiJson: fail, apiForm: fail } }, payload => payload?.error === 'storage_quota_exceeded', QuotaSignal,
  );
  for (const request of requests) {
    const error = await request('/api/upload', {}).catch(error => error);
    expect(error.storageQuotaExceeded).toBe(true);
    expect(error.quota_bytes).toBe(100);
    expect(error.used_bytes).toBe(95);
  }
});
