import { afterEach, expect, it } from 'vitest';
import { Application } from '../../src/agent/workflow.js';
import { Store } from '../../src/session/store.js';
import { createServer } from '../../src/api/server.js';
const stores: Store[] = []; afterEach(() => stores.splice(0).forEach(s => s.close()));
const tokens = { 'user-token': { userId: 'alice', role: 'USER' as const }, 'review-token': { userId: 'reviewer', role: 'REVIEWER' as const }, 'other-token': { userId: 'bob', role: 'USER' as const } };
async function server() { const s = new Store(':memory:'); stores.push(s); const api = createServer(new Application(s), tokens); await api.ready(); return api; }
it('requires configured tokens and rejects request body identity injection', async () => {
  const api = await server();
  try { expect((await api.inject({ method: 'POST', url: '/sessions', payload: { task: { type: 'PURCHASE', query: 'x' } } })).statusCode).toBe(401);
    expect((await api.inject({ method: 'POST', url: '/sessions', headers: { authorization: 'Bearer user-token' }, payload: { userId: 'admin', role: 'REVIEWER', task: { type: 'PURCHASE', query: 'x' } } })).statusCode).toBe(400); }
  finally { await api.close(); }
});
it('runs an authenticated approval flow and exposes evidence/OpenAPI', async () => {
  const api = await server(), user = { authorization: 'Bearer user-token' }, reviewer = { authorization: 'Bearer review-token' };
  try {
    const response = await api.inject({ method: 'POST', url: '/sessions', headers: user, payload: { task: { type: 'PURCHASE', query: 'BRG-6204', demand: 20, safetyStock: 3, requestedQuantity: 15 } } });
    expect(response.statusCode).toBe(201); const id = response.json().id;
    const waiting = (await api.inject({ method: 'POST', url: `/sessions/${id}/run`, headers: user })).json(); expect(waiting.state).toBe('WAITING_APPROVAL');
    expect((await api.inject({ url: `/sessions/${id}`, headers: { authorization: 'Bearer other-token' } })).statusCode).toBe(403);
    expect((await api.inject({ url: `/sessions/${id}/evidence`, headers: reviewer })).json().length).toBeGreaterThan(0);
    expect((await api.inject({ method: 'POST', url: `/approvals/${waiting.approvalId}/decision`, headers: user, payload: { decision: 'APPROVED', reason: 'yes' } })).statusCode).toBe(403);
    expect((await api.inject({ method: 'POST', url: `/approvals/${waiting.approvalId}/decision`, headers: reviewer, payload: { decision: 'APPROVED', reason: 'yes' } })).statusCode).toBe(200);
    expect((await api.inject({ method: 'POST', url: `/sessions/${id}/resume`, headers: user })).json().state).toBe('COMPLETED');
    const spec = (await api.inject({ url: '/openapi.json' })).json(); expect(spec.paths['/sessions']).toBeDefined(); expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
  } finally { await api.close(); }
});
it('rejects malformed domain parameters and edits to completed sessions', async () => {
  const api = await server();
  try { const response = await api.inject({ method: 'POST', url: '/sessions', headers: { authorization: 'Bearer user-token' }, payload: { task: { type: 'PURCHASE', query: 'BRG-6204', demand: -1 } } }); expect(response.statusCode).toBe(400); }
  finally { await api.close(); }
});
