import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../agent/workflow.js';
import { Store } from '../session/store.js';
import { cases, type BenchmarkCase } from './cases.js';
import type { Session } from '../domain/types.js';
export interface BenchmarkReport {
  mode: 'synthetic-offline'; cases: { name: string; state: string; passed: boolean; selectedTools: string[] }[]; unauthorizedWrites: number;
  metrics: { materialRetrievalRecallAtK: number; attributionAccuracy: number; duplicatePrecisionRecall: { precision: number; recall: number }; toolSelectionAccuracy: number; policyViolationRate: number; recoverySuccessRate: number; endToEndSuccessRate: number };
}
export function scoreCase(label: BenchmarkCase, s: Session, selectedTools: string[], writes: number) {
  const toolSlots = Math.max(label.expectedTools.length, selectedTools.length), toolMatches = label.expectedTools.filter((name, i) => name === selectedTools[i]).length;
  const attributed = label.expectedMaterial === undefined || (s.attribution?.materialId === label.expectedMaterial && s.material?.id === label.expectedMaterial);
  const duplicate = label.expectedDuplicate === undefined || s.duplicate?.duplicate === label.expectedDuplicate;
  return { passed: s.state === label.expectedState && attributed && duplicate && writes === (label.approve ? 1 : 0) && toolMatches === toolSlots, attributed, duplicate, toolSlots, toolMatches };
}
class InterruptedCheckpointStore extends Store {
  private interrupted = false;
  override saveSession(s: Session, changes?: Parameters<Store['saveSession']>[1]) { if (s.state === 'VERIFYING' && !this.interrupted) { this.interrupted = true; throw new Error('benchmark write/checkpoint interruption'); } return super.saveSession(s, changes); }
}
export async function runBenchmark(): Promise<BenchmarkReport> {
  const user = { userId: 'benchmark-user', role: 'USER' as const }, reviewer = { userId: 'benchmark-reviewer', role: 'REVIEWER' as const };
  const results: BenchmarkReport['cases'] = [];
  let retrieval = 0, retrievalN = 0, attribution = 0, attributionN = 0, tp = 0, fp = 0, fn = 0, toolCorrect = 0, toolN = 0, recovered = 0, recoveryN = 0, unauthorizedWrites = 0, policies = 0;
  for (const item of cases) {
    const dir = mkdtempSync(join(tmpdir(), 'material-benchmark-')), path = join(dir, 'state.db'); let store = item.interruptAfterWrite ? new InterruptedCheckpointStore(path) : new Store(path), app = new Application(store);
    try {
      let s = await app.run(user, app.create(user, item.task).id);
      if (item.clarify) { app.supplement(user, s.id, item.clarify); s = await app.run(user, s.id); }
      if (item.expectedRetrievedMaterial) { retrievalN++; if (s.candidates.slice(0, 5).some(c => c.material.id === item.expectedRetrievedMaterial)) retrieval++; }
      if (item.expectedMaterial) { attributionN++; if (s.attribution?.materialId === item.expectedMaterial && s.material?.id === item.expectedMaterial) attribution++; }
      if (item.expectedDuplicate !== undefined) { const predicted = s.duplicate?.duplicate; if (predicted && item.expectedDuplicate) tp++; if (predicted && !item.expectedDuplicate) fp++; if (predicted !== true && item.expectedDuplicate) fn++; if (predicted === undefined && !item.expectedDuplicate) fp++; }
      const before = store.erpCount(); if (s.state === 'WAITING_APPROVAL' && before !== 0) unauthorizedWrites += before;
      if (item.probeUnauthorized) { const p = s.proposal!; await app.router.call({ userId: 'intruder', role: 'USER' }, s, { requestId: 'unauthorized-probe', sessionId: s.id, toolName: 'execute_approved_action', args: { proposalId: p.id, version: p.version }, idempotencyKey: p.idempotencyKey }); unauthorizedWrites += store.erpCount() - before; }
      if (item.approve || item.reject) { app.decide(reviewer, s.approvalId!, item.approve ? 'APPROVED' : 'REJECTED', 'benchmark labeled decision'); }
      if (item.recover) { recoveryN++; store.close(); store = new Store(path); app = new Application(store); }
      if (item.approve || item.reject) s = await app.run(user, s.id);
      if (item.recover) { await app.run(user, s.id); if (s.state === 'COMPLETED' && store.erpCount() === 1) recovered++; }
      if (item.interruptAfterWrite) {
        recoveryN++; const uncertain = s.state === 'RECOVERABLE' && store.erpCount() === 1;
        app.planner.execute = async () => { throw new Error('benchmark model unavailable during recovery'); };
        s = await app.run(user, s.id); if (uncertain && s.state === 'COMPLETED' && store.erpCount() === 1) recovered++;
      }
      const events = app.events(user, s.id), selectedTools = events.filter(e => e.type === 'TOOL_RESULT').map(e => e.toolName!);
      const score = scoreCase(item, s, selectedTools, store.erpCount()); toolN += score.toolSlots; toolCorrect += score.toolMatches;
      policies += events.filter(e => e.type === 'POLICY').length;
      results.push({ name: item.name, state: s.state, passed: score.passed, selectedTools });
    } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
  }
  return { mode: 'synthetic-offline', cases: results, unauthorizedWrites, metrics: { materialRetrievalRecallAtK: retrieval / retrievalN, attributionAccuracy: attribution / attributionN, duplicatePrecisionRecall: { precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) }, toolSelectionAccuracy: toolCorrect / toolN, policyViolationRate: unauthorizedWrites / (policies || 1), recoverySuccessRate: recovered / (recoveryN || 1), endToEndSuccessRate: results.filter(c => c.passed).length / results.length } };
}
export function formatReport(report: BenchmarkReport) { return ['Material Agent 合成数据离线 Benchmark', ...Object.entries(report.metrics).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), `unauthorizedWrites: ${report.unauthorizedWrites}`, ...report.cases.map(c => `${c.passed ? 'PASS' : 'FAIL'} ${c.name}: ${c.state}`)].join('\n'); }
