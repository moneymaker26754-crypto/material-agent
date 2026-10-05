import { expect, it } from 'vitest';
import { canTransition } from '../../src/agent/state.js';
import { compactContext } from '../../src/context/manager.js';
import { preToolUse } from '../../src/harness/policy.js';
it('rejects illegal state jumps to execution', () => { expect(canTransition('DISCOVERY', 'EXECUTING')).toBe(false); expect(canTransition('WAITING_APPROVAL', 'EXECUTING')).toBe(true); });
it('preserves policy and evidence identity during compaction', () => {
  const pack = { task: { type: 'PURCHASE' as const, query: 'bearing' }, state: 'DISCOVERY' as const, evidence: [{ evidenceId: 'e1', source: 'ERP', recordId: 'm1' }], policy: ['L3 requires approval'], toolTrace: Array.from({ length: 30 }, (_, i) => `trace${i}`) };
  const result = compactContext(pack, 5); expect(result.evidence).toEqual(pack.evidence); expect(result.policy).toEqual(pack.policy); expect(result.toolTrace.length).toBeLessThanOrEqual(6); expect(pack.toolTrace).toHaveLength(30);
});
it('uses server risk rather than a model supplied downgrade', () => expect(preToolUse({ risk: 3, stateAllowed: true, authorized: true, evidenceComplete: true, approved: false }).action).toBe('APPROVAL'));
it('denies wrong-stage and unauthorized operations', () => { expect(preToolUse({ risk: 0, stateAllowed: false, authorized: true, evidenceComplete: true, approved: false }).action).toBe('DENY'); expect(preToolUse({ risk: 0, stateAllowed: true, authorized: false, evidenceComplete: true, approved: false }).action).toBe('DENY'); });
