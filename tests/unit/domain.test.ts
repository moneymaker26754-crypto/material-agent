import { describe, expect, it } from 'vitest';
import { duplicateCheck, estimateImpact, searchMaterials } from '../../src/domain/rules.js';
import type { Inventory, Material, Purchase } from '../../src/domain/types.js';
const material: Material = { id: 'm1', code: 'B-001', name: '轴承', aliases: ['bearing'], specification: '6204', unit: '个', currency: 'CNY', unitPriceMinor: 1250 };
const other: Material = { ...material, id: 'm2', code: 'B-002', specification: '6205' };
const inventory: Inventory[] = [
  { id: 'i1', materialId: 'm1', quantity: 10, reserved: 2, status: 'AVAILABLE' },
  { id: 'i2', materialId: 'm1', quantity: 99, reserved: 0, status: 'FROZEN' },
  { id: 'i3', materialId: 'm1', quantity: 99, reserved: 0, status: 'SCRAPPED' }
];
const purchases: Purchase[] = [
  { id: 'p1', materialId: 'm1', quantity: 7, received: 2, status: 'CONFIRMED' },
  { id: 'p2', materialId: 'm1', quantity: 100, received: 100, status: 'COMPLETED' },
  { id: 'p3', materialId: 'm1', quantity: 100, received: 0, status: 'CANCELLED' }
];
describe('material retrieval', () => {
  it('prioritizes normalized exact code', () => expect(searchMaterials([other, material], { query: ' b-001 ' })[0]?.material.id).toBe('m1'));
  it('matches alias and specification without accepting a conflict', () => expect(searchMaterials([material, other], { query: 'BEARING', specification: '６２０４', unit: '个' }).map(c => c.material.id)).toEqual(['m1']));
  it('retains ambiguous names for clarification', () => expect(searchMaterials([material, other], { query: '轴承' })).toHaveLength(2));
  it('rejects conflicting units', () => expect(searchMaterials([material], { query: '轴承', unit: 'kg' })).toEqual([]));
  it('does not treat blank queries as every material', () => expect(() => searchMaterials([material], { query: ' ' })).toThrow());
  it('retrieves by specification without needing the material name', () => expect(searchMaterials([material, other], { query: '6204' }).map(c => c.material.id)).toEqual(['m1']));
});
describe('deterministic purchasing', () => {
  it('counts only available stock and outstanding confirmed orders', () => expect(duplicateCheck(material, inventory, purchases)).toMatchObject({ duplicate: true, availableQuantity: 8, onOrderQuantity: 5, historicalPurchaseIds: ['p1', 'p2', 'p3'] }));
  it('calculates quantity and integer monetary impact', () => expect(estimateImpact({ type: 'PURCHASE', query: '轴承', demand: 20, safetyStock: 3, requestedQuantity: 15 }, material, inventory, purchases)).toMatchObject({ recommendedQuantity: 10, projectedInventory: 8, shortageQuantity: 0, excessQuantity: 5, requestedCostMinor: 18750, recommendedCostMinor: 12500 }));
  it('reports shortages without making up supply', () => expect(estimateImpact({ type: 'PURCHASE', query: '轴承', demand: 20, safetyStock: 3, requestedQuantity: 2 }, material, inventory, purchases)).toMatchObject({ shortageQuantity: 8, excessQuantity: 0 }));
  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects missing or invalid demand %s', demand => expect(() => estimateImpact({ type: 'PURCHASE', query: '轴承', demand, safetyStock: 0, requestedQuantity: 1 }, material, [], [])).toThrow());
  it('rejects stock with impossible reservations', () => expect(() => duplicateCheck(material, [{ ...inventory[0]!, reserved: 11 }], [])).toThrow());
  it('rejects unsafe monetary overflow', () => expect(() => estimateImpact({ type: 'PURCHASE', query: '轴承', demand: 1, safetyStock: 0, requestedQuantity: Number.MAX_SAFE_INTEGER }, material, [], [])).toThrow());
});
