import { apiText } from './http.js';

export const getVersion = () => apiText(`/api/version?${Date.now()}`);
