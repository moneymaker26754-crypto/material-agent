import { searchMaterials } from '../domain/rules.js';
import { AppError, type Inventory, type Material, type MaterialQuery, type Purchase } from '../domain/types.js';
import type { Store } from '../session/store.js';
export interface DataSource { call(name: string, args: Record<string, unknown>): Promise<unknown>; close?(): Promise<void> }
export class LocalDataSource implements DataSource {
  constructor(private store: Store) {}
  async call(name: string, args: Record<string, unknown>) {
    if (name === 'search_material') return searchMaterials(this.store.list<Material>('materials'), args as unknown as MaterialQuery);
    if (name === 'get_material_detail') { const m = this.store.getMaterial(String(args.materialId)); if (!m) throw new AppError('NOT_FOUND', 'material not found', 404); return m; }
    if (name === 'get_inventory') return this.store.list<Inventory>('inventory').filter(i => i.materialId === args.materialId);
    if (name === 'get_purchase_history') return this.store.list<Purchase>('purchases').filter(p => p.materialId === args.materialId);
    throw new AppError('UNKNOWN_TOOL', 'data tool not registered');
  }
}
