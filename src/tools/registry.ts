import { z } from 'zod';
import { inventorySchema, materialIdSchema, materialSchema, proposalArgsSchema, purchaseSchema, querySchema } from '../domain/schemas.js';
import type { State } from '../domain/types.js';
export interface ToolDefinition { name: string; description: string; risk: number; states: State[]; schema: z.ZodType; output?: z.ZodType; readonly: boolean }
export const definitions: ToolDefinition[] = [
  { name: 'search_material', description: 'Find materials by query, specification and unit', risk: 0, states: ['DISCOVERY'], schema: querySchema, readonly: true },
  { name: 'get_material_detail', description: 'Read selected material master data', risk: 0, states: ['ATTRIBUTION', 'VERIFYING'], schema: materialIdSchema, output: materialSchema, readonly: true },
  { name: 'record_attribution', description: 'Explain selected material using verified evidence references; confidence is not calibrated probability', risk: 1, states: ['ATTRIBUTION'], schema: materialIdSchema.extend({ confidence: z.number().min(0).max(1), reasons: z.array(z.string().min(1).max(500)).min(1).max(8), evidenceIds: z.array(z.string()).min(1).max(32) }).strict(), readonly: true },
  { name: 'get_purchase_history', description: 'Read material purchase records', risk: 0, states: ['DUPLICATE_CHECK'], schema: materialIdSchema, output: purchaseSchema.array(), readonly: true },
  { name: 'get_inventory', description: 'Read current inventory including status and reservations', risk: 0, states: ['DUPLICATE_CHECK'], schema: materialIdSchema, output: inventorySchema.array(), readonly: true },
  { name: 'check_duplicate', description: 'Run deterministic duplicate procurement rules', risk: 1, states: ['DUPLICATE_CHECK'], schema: materialIdSchema, readonly: true },
  { name: 'estimate_purchase_impact', description: 'Calculate validated stock and purchase impact', risk: 1, states: ['IMPACT_ESTIMATION'], schema: materialIdSchema, readonly: true },
  { name: 'create_material_proposal', description: 'Persist a controlled material proposal', risk: 2, states: ['PROPOSAL_READY'], schema: proposalArgsSchema, readonly: false },
  { name: 'create_purchase_proposal', description: 'Persist a controlled purchase proposal', risk: 2, states: ['PROPOSAL_READY'], schema: proposalArgsSchema, readonly: false },
  { name: 'execute_approved_action', description: 'Execute only the current approved proposal', risk: 3, states: ['POLICY_CHECK', 'WAITING_APPROVAL', 'EXECUTING'], schema: proposalArgsSchema, readonly: false }
];
