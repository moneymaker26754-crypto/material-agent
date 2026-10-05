import { expect, it } from 'vitest';
import { Application } from '../../src/agent/workflow.js';
import { Store } from '../../src/session/store.js';
it.skipIf(!process.env.MODEL_API_KEY || !process.env.MODEL_NAME)('uses a configured real provider without synthetic fallback', async () => {
  const store = new Store(':memory:');
  try { const app = new Application(store, { mode: 'live', provider: (process.env.MODEL_PROVIDER ?? 'openai') as 'openai', model: process.env.MODEL_NAME, apiKey: process.env.MODEL_API_KEY, baseUrl: process.env.MODEL_BASE_URL }); const actor = { userId: 'live-test', role: 'USER' as const };
    const result = await app.run(actor, app.create(actor, { type: 'PURCHASE', query: 'BRG-6204', demand: 20, safetyStock: 3, requestedQuantity: 10 }).id);
    expect(result.state).toBe('WAITING_APPROVAL'); expect(store.erpCount()).toBe(0);
  } finally { store.close(); }
}, 300000);
