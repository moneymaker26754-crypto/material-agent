import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application } from '../agent/workflow.js';
import { Store } from '../session/store.js';
import { cases } from './cases.js';
export interface BenchmarkReport {
  mode: 'synthetic-offline'; cases: { name: string; state: string; passed: boolean; selectedTools: string[] }[]; unauthorizedWrites: number;
  metrics: { materialRetrievalRecallAtK: number; attributionAccuracy: number; duplicatePrecisionRecall: { precision: number; recall: number }; toolSelectionAccuracy: number; policyViolationRate: number; recoverySuccessRate: number; endToEndSuccessRate: number };
}
export async function runBenchmark(): Promise<BenchmarkReport> {
  const user = { userId: 'benchmark-user', role: 'USER' as const }, reviewer = { userId: 'benchmark-reviewer', role: 'REVIEWER' as const };
  const results: BenchmarkReport['cases'] = [];
  let retrieval = 0, retrievalN = 0, attribution = 0, attributionN = 0, tp = 0, fp = 0, fn = 0, toolCorrect = 0, toolN = 0, recovered = 0, recoveryN = 0, unauthorizedWrites = 0, policies = 0;
  for (const item of cases) {
    const dir = mkdtempSync(join(tmpdir(), 'material-benchmark-')), path = join(dir, 'state.db'); let store = new Store(path), app = new Application(store);
    try {
      let s = await app.run(user, app.create(user, item.task).id);
      if (item.clarify) { app.supplement(user, s.id, item.clarify); s = await app.run(user, s.id); }
      if (item.expectedMaterial) { retrievalN++; if (s.candidates.slice(0, 5).some(c => c.material.id === item.expectedMaterial)) retrieval++; if (s.material) { attributionN++; if (s.material.id === item.expectedMaterial) attribution++; } }
      if (item.expectedDuplicate !== undefined && s.duplicate) { const predicted = s.duplicate.duplicate; if (predicted && item.expectedDuplicate) tp++; if (predicted && !item.expectedDuplicate) fp++; if (!predicted && item.expectedDuplicate) fn++; }
      const before = store.erpCount(); if (s.state === 'WAITING_APPROVAL' && before !== 0) unauthorizedWrites += before;
      if (item.probeUnauthorized) { const p = s.proposal!; await app.router.call({ userId: 'intruder', role: 'USER' }, s, { requestId: 'unauthorized-probe', sessionId: s.id, toolName: 'execute_approved_action', args: { proposalId: p.id, version: p.version }, idempotencyKey: p.idempotencyKey }); unauthorizedWrites += store.erpCount() - before; }
      if (item.approve || item.reject) { app.decide(reviewer, s.approvalId!, item.approve ? 'APPROVED' : 'REJECTED', 'benchmark labeled decision'); }
      if (item.recover) { recoveryN++; store.close(); store = new Store(path); app = new Application(store); }
      if (item.approve || item.reject) s = await app.run(user, s.id);
      if (item.recover) { await app.run(user, s.id); if (s.state === 'COMPLETED' && store.erpCount() === 1) recovered++; }
      const events = app.events(user, s.id), selectedTools = events.filter(e => e.type === 'TOOL_RESULT').map(e => e.toolName!);
      const expectedTools = item.task.type === 'MATERIAL' ? ['search_material', 'get_purchase_history', 'get_inventory', 'check_duplicate', 'create_material_proposal'] : s.state === 'NEED_MORE_EVIDENCE' && !s.material ? ['search_material'] : ['search_material', 'get_material_detail', 'get_purchase_history', 'get_inventory', 'check_duplicate', ...(item.task.demand === undefined ? [] : ['estimate_purchase_impact', 'create_purchase_proposal'])];
      if (item.approve) expectedTools.push('execute_approved_action');
      toolN += expectedTools.length; toolCorrect += expectedTools.filter(t => selectedTools.includes(t)).length;
      policies += events.filter(e => e.type === 'POLICY').length;
      const passed = s.state === item.expectedState && (!item.expectedMaterial || s.state === 'NEED_MORE_EVIDENCE' || s.material?.id === item.expectedMaterial) && (item.expectedDuplicate === undefined || !s.duplicate || s.duplicate.duplicate === item.expectedDuplicate) && (item.approve ? store.erpCount() === 1 : store.erpCount() === 0);
      results.push({ name: item.name, state: s.state, passed, selectedTools });
    } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
  }
  return { mode: 'synthetic-offline', cases: results, unauthorizedWrites, metrics: { materialRetrievalRecallAtK: retrieval / retrievalN, attributionAccuracy: attribution / attributionN, duplicatePrecisionRecall: { precision: tp / (tp + fp || 1), recall: tp / (tp + fn || 1) }, toolSelectionAccuracy: toolCorrect / toolN, policyViolationRate: unauthorizedWrites / (policies || 1), recoverySuccessRate: recovered / (recoveryN || 1), endToEndSuccessRate: results.filter(c => c.passed).length / results.length } };
}
export function formatReport(report: BenchmarkReport) { return ['Material Agent 合成数据离线 Benchmark', ...Object.entries(report.metrics).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), `unauthorizedWrites: ${report.unauthorizedWrites}`, ...report.cases.map(c => `${c.passed ? 'PASS' : 'FAIL'} ${c.name}: ${c.state}`)].join('\n'); }
