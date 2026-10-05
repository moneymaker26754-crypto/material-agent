import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../../src/agent/workflow.js';
import { Store } from '../../src/session/store.js';
import type { Actor, Session, Task } from '../../src/domain/types.js';
const user: Actor = { userId: 'alice', role: 'USER' }, reviewer: Actor = { userId: 'reviewer', role: 'REVIEWER' };
const task: Task = { type: 'PURCHASE', query: 'BRG-6204', demand: 20, safetyStock: 3, requestedQuantity: 15, unit: '个' };
const stores: Store[] = [], directories: string[] = [];
function app(path = ':memory:') { const store = new Store(path); stores.push(store); return new Application(store); }
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('controlled workflow', () => {
  it('uses pi tool selection and persists evidence before stopping for approval', async () => {
    const a = app(), s = a.create(user, task), result = await a.run(user, s.id);
    expect(result.state).toBe('WAITING_APPROVAL'); expect(result.impact?.recommendedQuantity).toBe(10);
    expect(a.store.erpCount()).toBe(0); expect(a.evidence(user, s.id).length).toBeGreaterThanOrEqual(4);
    expect(a.events(user, s.id).some(e => e.type === 'MODEL_TURN')).toBe(true);
    expect(a.events(user, s.id).filter(e => e.type === 'TOOL_RESULT').map(e => e.toolName)).toContain('search_material');
  });
  it('executes once after approval and verifies the ERP result', async () => {
    const a = app(), s = await a.run(user, a.create(user, task).id);
    a.decide(reviewer, s.approvalId!, 'APPROVED', '需求确认');
    const result = await a.run(user, s.id);
    expect(result.state).toBe('COMPLETED'); expect(a.store.erpCount()).toBe(1);
    await a.run(user, s.id); expect(a.store.erpCount()).toBe(1);
  });
  it('keeps rejected versions blocked and invalidates approval when the proposal changes', async () => {
    const a = app(), s = await a.run(user, a.create(user, task).id);
    a.decide(reviewer, s.approvalId!, 'REJECTED', '数量偏高');
    expect((await a.run(user, s.id)).state).toBe('PROPOSAL_READY');
    expect((await a.run(user, s.id)).state).toBe('PROPOSAL_READY'); expect(a.store.erpCount()).toBe(0);
    a.supplement(user, s.id, { requestedQuantity: 10 });
    const revised = await a.run(user, s.id); expect(revised.state).toBe('WAITING_APPROVAL');
    expect(revised.proposal?.version).toBe(2); expect(revised.approvalId).not.toBe(s.approvalId);
    expect(() => a.decide(reviewer, s.approvalId!, 'APPROVED', 'stale')).toThrow();
  });
  it('does not automatically choose ambiguous material and accepts clarification', async () => {
    const a = app(), s = await a.run(user, a.create(user, { ...task, query: '轴承' }).id);
    expect(s.state).toBe('NEED_MORE_EVIDENCE'); expect(s.candidates).toHaveLength(2);
    a.supplement(user, s.id, { specification: '6204' }); expect((await a.run(user, s.id)).state).toBe('WAITING_APPROVAL');
  });
  it('waits for missing quantity rather than inventing it', async () => {
    const a = app(), s = await a.run(user, a.create(user, { type: 'PURCHASE', query: 'BRG-6204' }).id);
    expect(s.state).toBe('NEED_MORE_EVIDENCE'); expect(s.impact).toBeUndefined(); expect(a.store.erpCount()).toBe(0);
  });
  it('supports controlled material creation without inventing master data', async () => {
    const a = app(), s = await a.run(user, a.create(user, { type: 'MATERIAL', query: '新密封圈', newMaterial: { id: 'm-seal', code: 'SEAL-01', name: '新密封圈', aliases: [], specification: 'S10', unit: '个', currency: 'CNY', unitPriceMinor: 200 } }).id);
    expect(s.state).toBe('WAITING_APPROVAL'); a.decide(reviewer, s.approvalId!, 'APPROVED', '同意录入');
    expect((await a.run(user, s.id)).state).toBe('COMPLETED'); expect(a.store.getMaterial('m-seal')?.code).toBe('SEAL-01');
  });
  it('enforces ownership and reviewer permissions outside HTTP', async () => {
    const a = app(), s = await a.run(user, a.create(user, task).id);
    await expect(a.run({ userId: 'bob', role: 'USER' }, s.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(() => a.decide(user, s.approvalId!, 'APPROVED', '')).toThrow();
    expect(() => a.supplement(reviewer, s.id, { requestedQuantity: 1 })).toThrow();
  });
  it('restores approval and evidence after the database is reopened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'material-agent-')); directories.push(dir); const path = join(dir, 'state.db');
    const a = app(path), s = await a.run(user, a.create(user, task).id); a.decide(reviewer, s.approvalId!, 'APPROVED', 'yes');
    a.store.close(); const b = app(path); expect((await b.run(user, s.id)).state).toBe('COMPLETED');
    expect(b.evidence(user, s.id).length).toBeGreaterThan(0); expect(b.store.erpCount()).toBe(1);
  });
  it('rejects concurrent resume while an active run owns the lease', async () => {
    const a = app(), s = a.create(user, task), first = a.run(user, s.id);
    await expect(a.run(user, s.id)).rejects.toMatchObject({ code: 'SESSION_BUSY' }); await first;
  });
  it('reconciles ERP writes when the process stops before the verification checkpoint', async () => {
    class InterruptStore extends Store {
      interrupted = false;
      override saveSession(s: Session) { if (s.state === 'VERIFYING' && !this.interrupted) { this.interrupted = true; throw new Error('injected checkpoint failure'); } return super.saveSession(s); }
    }
    const store = new InterruptStore(':memory:'); stores.push(store); const a = new Application(store);
    const s = await a.run(user, a.create(user, task).id); a.decide(reviewer, s.approvalId!, 'APPROVED', 'yes');
    expect((await a.run(user, s.id)).state).toBe('RECOVERABLE'); expect(store.erpCount()).toBe(1);
    expect((await a.run(user, s.id)).state).toBe('COMPLETED'); expect(store.erpCount()).toBe(1);
  });
});
