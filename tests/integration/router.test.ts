import { afterEach, expect, it } from 'vitest';
import { Application } from '../../src/agent/workflow.js';
import { Store } from '../../src/session/store.js';
import { ToolRouter } from '../../src/tools/router.js';
import { LocalDataSource } from '../../src/tools/data-source.js';
const stores: Store[] = []; afterEach(() => stores.splice(0).forEach(s => s.close()));
const actor = { userId: 'a', role: 'USER' as const };
function setup() { const store = new Store(':memory:'); stores.push(store); const app = new Application(store); return { store, app, s: app.create(actor, { type: 'PURCHASE', query: 'BRG-6204', demand: 1, safetyStock: 0, requestedQuantity: 1 }) }; }
it('denies direct tool calls in the wrong stage without side effects', async () => {
  const { app, s, store } = setup(); const result = await app.router.call(actor, s, { requestId: 'r', sessionId: s.id, toolName: 'get_inventory', args: { materialId: 'm-bearing-6204' }, riskLevel: 0 });
  expect(result.errorCode).toBe('POLICY_DENIED'); expect(store.erpCount()).toBe(0);
});
it('rejects cross-session tool binding', async () => {
  const { app, s } = setup(); expect((await app.router.call(actor, { ...s, state: 'DISCOVERY' }, { requestId: 'r', sessionId: 'other', toolName: 'search_material', args: { query: 'BRG-6204' } })).errorCode).toBe('FORBIDDEN');
});
it('does not accept malformed material data into evidence', async () => {
  const { app, s, store } = setup(); const dirty = new Application(store, { mode: 'demo' }, { async call() { return [{ material: { id: 'fake' }, score: 1, reasons: [] }]; } });
  expect((await dirty.run(actor, s.id)).state).toBe('FAILED'); expect(app.evidence(actor, s.id)).toEqual([]);
});
it('limits retries to three read attempts and never retries domain errors', async () => {
  const { s, store } = setup(); let attempts = 0;
  const router = new ToolRouter(store, { async call() { attempts++; throw new Error('network'); } });
  const result = await router.call(actor, { ...s, state: 'DISCOVERY' }, { requestId: 'r', sessionId: s.id, toolName: 'search_material', args: { query: 'x' } });
  expect(result.ok).toBe(false); expect(attempts).toBe(3);
});
it('rejects reused ERP idempotency keys with different payloads', async () => {
  const { app, store, s } = setup(); const waiting = await app.run(actor, s.id); const p = waiting.proposal!;
  store.executeERP(p); expect(() => store.executeERP({ ...p, argsHash: 'different', payload: { ...p.payload, quantity: 99 } })).toThrow(); expect(store.erpCount()).toBe(1);
});
it('rechecks approval binding even when riskLevel is downgraded by a caller', async () => {
  const { app, s, store } = setup(); const waiting = await app.run(actor, s.id); const p = waiting.proposal!;
  expect((await app.router.call(actor, waiting, { requestId: 'r', sessionId: s.id, toolName: 'execute_approved_action', args: { proposalId: p.id, version: p.version }, idempotencyKey: p.idempotencyKey, riskLevel: 0 })).errorCode).toBe('APPROVAL_REQUIRED'); expect(store.erpCount()).toBe(0);
});
it('can run the same application using its local data source contract', async () => {
  const { store, s } = setup(); const app = new Application(store, { mode: 'demo' }, new LocalDataSource(store)); expect((await app.run(actor, s.id)).state).toBe('WAITING_APPROVAL');
});
