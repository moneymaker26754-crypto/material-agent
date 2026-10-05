import { AppError, type Proposal } from '../domain/types.js';
import { hash, type Store } from '../session/store.js';
export function verifyExecution(store: Store, proposal: Proposal): unknown {
  const record = store.erpResult(proposal.idempotencyKey);
  if (!record || record.argsHash !== proposal.argsHash || hash(record.result.payload) !== hash(proposal.payload) || record.result.type !== proposal.type) throw new AppError('VERIFY_FAILED', 'ERP result differs from approved proposal');
  if (proposal.type === 'MATERIAL' && hash(store.getMaterial(proposal.payload.material.id)) !== hash(proposal.payload.material)) throw new AppError('VERIFY_FAILED', 'ERP material does not match proposal');
  return record.result;
}
