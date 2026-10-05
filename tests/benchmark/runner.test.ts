import { expect, it } from 'vitest';
import { runBenchmark, scoreCase } from '../../src/benchmark/runner.js';
import { cases } from '../../src/benchmark/cases.js';
import type { Session } from '../../src/domain/types.js';
it('fails labeled cases when predictions or tools are missing or unexpected', () => {
  const label = cases[0]!, missing = { state: 'COMPLETED' } as Session;
  expect(scoreCase(label, missing, label.expectedTools, 1).passed).toBe(false);
  const valid = { ...missing, material: { id: 'm-bearing-6204' }, attribution: { materialId: 'm-bearing-6204' }, duplicate: { duplicate: true } } as Session;
  expect(scoreCase(label, valid, [...label.expectedTools, 'unexpected_tool'], 1).passed).toBe(false);
  expect(scoreCase(label, valid, label.expectedTools.slice(1), 1).passed).toBe(false);
});
it('evaluates seven metrics from labeled behavior and records zero unauthorized writes', async () => {
  const report = await runBenchmark(); expect(report.cases.length).toBeGreaterThanOrEqual(8); expect(Object.keys(report.metrics)).toHaveLength(7);
  expect(report.metrics.materialRetrievalRecallAtK).toBe(1); expect(report.metrics.attributionAccuracy).toBe(1);
  expect(report.metrics.duplicatePrecisionRecall).toEqual({ precision: 1, recall: 1 });
  expect(report.metrics.policyViolationRate).toBe(0); expect(report.metrics.recoverySuccessRate).toBe(1); expect(report.metrics.endToEndSuccessRate).toBe(1);
  expect(report.unauthorizedWrites).toBe(0); expect(report.cases.every(c => c.passed)).toBe(true);
});
