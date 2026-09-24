import { describe, expect, it } from 'vitest';
import HistoryBulkManager from '../src/shared/history-bulk-manager.js';

describe('HistoryBulkManager module boundary', () => {
  it('exports the attach API without registering a window global', () => {
    expect(typeof HistoryBulkManager.attach).toBe('function');
    expect(globalThis.HistoryBulkManager).toBeUndefined();
  });
});
