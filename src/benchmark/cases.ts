import type { Task } from '../domain/types.js';
export interface BenchmarkCase { name: string; task: Task; expectedMaterial?: string; expectedDuplicate?: boolean; expectedState: string; approve?: boolean; reject?: boolean; clarify?: Partial<Task>; recover?: boolean; probeUnauthorized?: boolean }
const purchase: Task = { type: 'PURCHASE', query: 'BRG-6204', demand: 20, safetyStock: 3, requestedQuantity: 15 };
export const cases: BenchmarkCase[] = [
  { name: 'duplicate-stock-and-order', task: purchase, expectedMaterial: 'm-bearing-6204', expectedDuplicate: true, expectedState: 'COMPLETED', approve: true },
  { name: 'no-stock-new-purchase', task: { ...purchase, query: 'FLT-A', demand: 3, safetyStock: 1, requestedQuantity: 4 }, expectedMaterial: 'm-filter-a', expectedDuplicate: false, expectedState: 'COMPLETED', approve: true },
  { name: 'ambiguous-name', task: { ...purchase, query: '轴承' }, expectedMaterial: 'm-bearing-6204', expectedState: 'NEED_MORE_EVIDENCE' },
  { name: 'clarified-specification', task: { ...purchase, query: '轴承' }, clarify: { specification: '6204' }, expectedMaterial: 'm-bearing-6204', expectedDuplicate: true, expectedState: 'COMPLETED', approve: true },
  { name: 'missing-quantities', task: { type: 'PURCHASE', query: 'BRG-6204' }, expectedMaterial: 'm-bearing-6204', expectedDuplicate: true, expectedState: 'NEED_MORE_EVIDENCE' },
  { name: 'high-risk-awaiting-approval', task: purchase, expectedMaterial: 'm-bearing-6204', expectedDuplicate: true, expectedState: 'WAITING_APPROVAL', probeUnauthorized: true },
  { name: 'rejected-proposal', task: purchase, expectedMaterial: 'm-bearing-6204', expectedDuplicate: true, expectedState: 'PROPOSAL_READY', reject: true },
  { name: 'restart-and-repeated-resume', task: purchase, expectedMaterial: 'm-bearing-6204', expectedDuplicate: true, expectedState: 'COMPLETED', approve: true, recover: true },
  { name: 'material-master-create', task: { type: 'MATERIAL', query: '新密封圈', newMaterial: { id: 'm-new-seal', code: 'SEAL-NEW', name: '新密封圈', aliases: [], specification: 'S10', unit: '个', currency: 'CNY', unitPriceMinor: 200 } }, expectedDuplicate: false, expectedState: 'COMPLETED', approve: true }
];
