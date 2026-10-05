import { afterEach, expect, it } from 'vitest';
import { Application } from '../../src/agent/workflow.js';
import { Store } from '../../src/session/store.js';
import type { Session } from '../../src/domain/types.js';
const stores: Store[] = []; afterEach(() => stores.splice(0).forEach(s => s.close()));
const actor = { userId: 'a', role: 'USER' as const };
it('rolls back the checkpoint if the matching state audit event cannot be saved', () => {
  const store = new Store(':memory:'); stores.push(store); const app = new Application(store);
  const s = app.create(actor, { type: 'PURCHASE', query: 'BRG-6204' });
  store.db.exec("CREATE TEMP TRIGGER reject_transition BEFORE INSERT ON events WHEN json_extract(NEW.body,'$.type')='STATE_TRANSITION' BEGIN SELECT RAISE(ABORT,'event storage failure'); END;");
  expect(() => store.saveSession({ ...s, state: 'DISCOVERY' }, { event: { sessionId: s.id, requestId: 'r', type: 'STATE_TRANSITION', stateBefore: 'RECEIVED', stateAfter: 'DISCOVERY' } })).toThrow();
  expect(store.getSession(s.id).state).toBe('RECEIVED'); expect(store.getSession(s.id).version).toBe(1);
  expect(Number(store.db.prepare('SELECT count(*) AS n FROM checkpoints WHERE session_id=?').get(s.id)!.n)).toBe(1);
});
it('never leaves an orphan approval when its waiting checkpoint fails', async () => {
  class InterruptStore extends Store {
    private interrupted = false;
    override saveSession(s: Session, changes?: Parameters<Store['saveSession']>[1]) { if (s.state === 'WAITING_APPROVAL' && !this.interrupted) { this.interrupted = true; throw new Error('approval checkpoint failure'); } return super.saveSession(s, changes); }
  }
  const store = new InterruptStore(':memory:'); stores.push(store); const app = new Application(store);
  const s = await app.run(actor, app.create(actor, { type: 'PURCHASE', query: 'BRG-6204', demand: 1, safetyStock: 0, requestedQuantity: 1 }).id);
  expect(s.state).toBe('RECOVERABLE'); expect(app.approvals({ userId: 'r', role: 'REVIEWER' })).toEqual([]);
  const resumed = await app.run(actor, s.id); expect(resumed.state).toBe('WAITING_APPROVAL'); expect(app.approvals({ userId: 'r', role: 'REVIEWER' })).toHaveLength(1);
});
