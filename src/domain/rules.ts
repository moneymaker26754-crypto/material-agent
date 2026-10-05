import { AppError, type Candidate, type DuplicateCheck, type Impact, type Inventory, type Material, type MaterialQuery, type Purchase, type Task } from './types.js';
import { inventorySchema, materialSchema, purchaseSchema } from './schemas.js';
export const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, '');
export function searchMaterials(materials: Material[], query: MaterialQuery): Candidate[] {
  const term = normalize(query.query);
  if (!term) throw new AppError('INVALID_DATA', 'invalid blank query');
  return materials.map(m => materialSchema.parse(m)).flatMap(material => {
    if (query.materialId && query.materialId !== material.id) return [];
    if (query.specification && normalize(query.specification) !== normalize(material.specification)) return [];
    if (query.unit && normalize(query.unit) !== normalize(material.unit)) return [];
    const exactCode = normalize(material.code) === term;
    const exactName = [material.name, material.specification, ...material.aliases].some(n => normalize(n) === term);
    const partial = [material.name, material.code, material.specification, ...material.aliases].some(n => normalize(n).includes(term));
    if (!exactCode && !exactName && !partial) return [];
    return [{ material, score: exactCode ? 1 : exactName ? 0.9 : 0.6, reasons: [exactCode ? 'exact_code' : exactName ? 'name_or_alias' : 'partial_name', ...(query.specification ? ['specification_match'] : []), ...(query.unit ? ['unit_match'] : [])] }];
  }).sort((a, b) => b.score - a.score || a.material.code.localeCompare(b.material.code));
}
function totals(material: Material, inventory: Inventory[], purchases: Purchase[]) {
  materialSchema.parse(material);
  const stock = inventory.map(i => inventorySchema.parse(i));
  const orders = purchases.map(p => purchaseSchema.parse(p));
  let availableQuantity = 0, onOrderQuantity = 0;
  for (const row of stock) {
    if (row.reserved > row.quantity) throw new AppError('INVALID_DATA', 'invalid reservation quantity');
    if (row.materialId === material.id && row.status === 'AVAILABLE') availableQuantity += row.quantity - row.reserved;
  }
  for (const row of orders) {
    if (row.received > row.quantity) throw new AppError('INVALID_DATA', 'invalid received quantity');
    if (row.materialId === material.id && row.status === 'CONFIRMED') onOrderQuantity += row.quantity - row.received;
  }
  safeNumber(availableQuantity); safeNumber(onOrderQuantity);
  return { availableQuantity, onOrderQuantity };
}
export function duplicateCheck(material: Material, inventory: Inventory[], purchases: Purchase[]): DuplicateCheck {
  const quantities = totals(material, inventory, purchases);
  return { duplicate: quantities.availableQuantity > 0 || quantities.onOrderQuantity > 0,
    reasons: [...(quantities.availableQuantity > 0 ? ['available_stock'] : []), ...(quantities.onOrderQuantity > 0 ? ['outstanding_purchase'] : [])],
    ...quantities, historicalPurchaseIds: purchases.filter(p => p.materialId === material.id).map(p => p.id) };
}
function safeNumber(value: number | undefined): asserts value is number {
  if (value === undefined) throw new AppError('NEED_MORE_EVIDENCE', 'missing quantity field');
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new AppError('INVALID_DATA', 'invalid quantity or overflow');
}
export function estimateImpact(task: Task, material: Material, inventory: Inventory[], purchases: Purchase[]): Impact {
  safeNumber(task.demand); safeNumber(task.safetyStock); safeNumber(task.requestedQuantity);
  if (task.unit && normalize(task.unit) !== normalize(material.unit)) throw new AppError('INVALID_DATA', 'invalid unit');
  const { availableQuantity, onOrderQuantity } = totals(material, inventory, purchases);
  const target = task.demand + task.safetyStock; safeNumber(target);
  const recommendedQuantity = Math.max(0, target - availableQuantity - onOrderQuantity);
  const requestedCostMinor = Math.round(task.requestedQuantity * material.unitPriceMinor);
  const recommendedCostMinor = Math.round(recommendedQuantity * material.unitPriceMinor);
  if (!Number.isSafeInteger(requestedCostMinor) || !Number.isSafeInteger(recommendedCostMinor)) throw new AppError('INVALID_DATA', 'monetary overflow');
  const supply = availableQuantity + onOrderQuantity + task.requestedQuantity; safeNumber(supply);
  return { availableQuantity, onOrderQuantity, recommendedQuantity, projectedInventory: supply - task.demand,
    shortageQuantity: Math.max(0, target - supply), excessQuantity: Math.max(0, task.requestedQuantity - recommendedQuantity),
    requestedCostMinor, recommendedCostMinor, currency: material.currency, unit: material.unit };
}
