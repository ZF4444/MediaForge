import { apiJson } from './http.js';

export async function loadAssetManagerBootstrap() {
  const [assets, prompts, configuration, me, usage] = await Promise.all([
    apiJson('/api/asset-library'),
    apiJson('/api/prompt-libraries'),
    apiJson('/api/ai/resources').catch(() => ({ connections: [], models: [] })),
    apiJson('/api/access-control/me').catch(() => ({ user_id: '', pages: [] })),
    apiJson('/api/storage/usage').catch(() => ({ usage_by_category: [] })),
  ]);

  return { assets, prompts, configuration, me, usage };
}
