import { expect, it } from 'vitest';
import { runBenchmark } from '../../src/benchmark/runner.js';
it('evaluates seven metrics from labeled behavior and records zero unauthorized writes', async () => {
  const report = await runBenchmark(); expect(report.cases.length).toBeGreaterThanOrEqual(8); expect(Object.keys(report.metrics)).toHaveLength(7);
  expect(report.metrics.materialRetrievalRecallAtK).toBe(1); expect(report.metrics.attributionAccuracy).toBe(1);
  expect(report.metrics.duplicatePrecisionRecall).toEqual({ precision: 1, recall: 1 });
  expect(report.metrics.policyViolationRate).toBe(0); expect(report.metrics.recoverySuccessRate).toBe(1); expect(report.metrics.endToEndSuccessRate).toBe(1);
  expect(report.unauthorizedWrites).toBe(0); expect(report.cases.every(c => c.passed)).toBe(true);
});
