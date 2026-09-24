import { apiJson } from './http.js';

export const getFileMetadata = fileId => apiJson(`/api/files/${encodeURIComponent(fileId)}`, { allowErrorResponse: true });
