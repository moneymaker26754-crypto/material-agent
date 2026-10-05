import type { Inventory, Material, Purchase } from './types.js';
export const materials: Material[] = [
  { id: 'm-bearing-6204', code: 'BRG-6204', name: '深沟球轴承', aliases: ['轴承', 'bearing'], specification: '6204', unit: '个', currency: 'CNY', unitPriceMinor: 1250 },
  { id: 'm-bearing-6205', code: 'BRG-6205', name: '深沟球轴承', aliases: ['轴承', 'bearing'], specification: '6205', unit: '个', currency: 'CNY', unitPriceMinor: 1800 },
  { id: 'm-bolt-m8', code: 'BOLT-M8', name: '不锈钢螺栓', aliases: ['螺栓', 'bolt'], specification: 'M8x30', unit: '个', currency: 'CNY', unitPriceMinor: 150 },
  { id: 'm-filter-a', code: 'FLT-A', name: '过滤芯', aliases: ['filter'], specification: 'A100', unit: '个', currency: 'CNY', unitPriceMinor: 3500 }
];
export const inventory: Inventory[] = [
  { id: 'stock-6204', materialId: 'm-bearing-6204', quantity: 10, reserved: 2, status: 'AVAILABLE' },
  { id: 'frozen-6204', materialId: 'm-bearing-6204', quantity: 99, reserved: 0, status: 'FROZEN' },
  { id: 'scrapped-6204', materialId: 'm-bearing-6204', quantity: 20, reserved: 0, status: 'SCRAPPED' },
  { id: 'stock-bolt', materialId: 'm-bolt-m8', quantity: 100, reserved: 20, status: 'AVAILABLE' }
];
export const purchases: Purchase[] = [
  { id: 'po-open-6204', materialId: 'm-bearing-6204', quantity: 7, received: 2, status: 'CONFIRMED' },
  { id: 'po-done-6204', materialId: 'm-bearing-6204', quantity: 100, received: 100, status: 'COMPLETED' }
];
