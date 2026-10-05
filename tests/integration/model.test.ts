import { afterEach, expect, it, vi } from 'vitest';
import { Application } from '../../src/agent/workflow.js';
import { Store } from '../../src/session/store.js';
const stores: Store[] = []; afterEach(() => { stores.splice(0).forEach(s => s.close()); vi.unstubAllGlobals(); });
it('uses compatible Chat Completions wire protocol and parses a real SDK tool stream', async () => {
  let url = '', body: Record<string, unknown> = {};
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    url = String(input); body = JSON.parse(String(init?.body));
    const chunks = [
      { id: 'response-1', object: 'chat.completion.chunk', model: 'test-model', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'search_material', arguments: '{"query":"BRG-6204"}' } }] }, finish_reason: null }] },
      { id: 'response-1', object: 'chat.completion.chunk', model: 'test-model', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
    ];
    return new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const store = new Store(':memory:'); stores.push(store); const app = new Application(store, { mode: 'live', provider: 'compatible', model: 'test-model', apiKey: 'synthetic-key', baseUrl: 'https://compatible.invalid/v1' });
  const actor = { userId: 'a', role: 'USER' as const }, s = app.create(actor, { type: 'PURCHASE', query: 'BRG-6204' }); s.state = 'DISCOVERY';
  const result = await app.planner.execute(actor, s, 'search_material', { query: 'BRG-6204' });
  expect(url).toBe('https://compatible.invalid/v1/chat/completions'); expect(body.messages).toBeDefined(); expect(body.input).toBeUndefined();
  expect(result.ok).toBe(true); expect(result.data).toMatchObject([{ material: { id: 'm-bearing-6204' } }]);
});
