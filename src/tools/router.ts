import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { materialSchema } from '../domain/schemas.js';
import { duplicateCheck, estimateImpact, searchMaterials } from '../domain/rules.js';
import { AppError, type Actor, type Approval, type Candidate, type Inventory, type Purchase, type Session, type ToolCall, type ToolResult } from '../domain/types.js';
import { preToolUse } from '../harness/policy.js';
import { hash, type Store } from '../session/store.js';
import { definitions } from './registry.js';
import { LocalDataSource, type DataSource } from './data-source.js';
export class ToolRouter {
  readonly source: DataSource;
  constructor(readonly store: Store, source?: DataSource, private timeoutMs = 10000) { this.source = source ?? new LocalDataSource(store); }
  policy(actor: Actor, session: Session, call: ToolCall) {
    const def = definitions.find(d => d.name === call.toolName);
    if (!def) throw new AppError('UNKNOWN_TOOL', 'unregistered tool');
    const args = def.schema.parse(call.args) as Record<string, unknown>;
    if (call.sessionId !== session.id) throw new AppError('FORBIDDEN', 'tool session mismatch', 403);
    if (args.materialId && session.material && args.materialId !== session.material.id) throw new AppError('FORBIDDEN', 'material differs from selected evidence', 403);
    if (def.risk >= 2 && (!session.proposal || args.proposalId !== session.proposal.id || args.version !== session.proposal.version)) throw new AppError('STALE_PROPOSAL', 'proposal binding mismatch', 409);
    const p = session.proposal;
    let approved = false;
    if (session.approvalId && p) {
      const a = this.store.getApproval(session.approvalId);
      approved = a.decision === 'APPROVED' && a.sessionId === session.id && a.toolName === call.toolName && a.proposalId === p.id && a.proposalVersion === p.version && a.argsHash === p.argsHash && a.idempotencyKey === p.idempotencyKey;
    }
    if (def.risk === 3 && (!p || call.idempotencyKey !== p.idempotencyKey || p.argsHash !== hash({ type: p.type, payload: p.payload }))) throw new AppError('INVALID_BINDING', 'execution hash or idempotency key mismatch', 409);
    const existing = call.idempotencyKey && this.store.execution(call.idempotencyKey);
    if (existing && p && existing.argsHash !== p.argsHash) throw new AppError('IDEMPOTENCY_CONFLICT', 'key was used for different arguments', 409);
    const decision = preToolUse({ risk: def.risk, stateAllowed: def.states.includes(session.state), authorized: actor.role === 'USER' && actor.userId === session.userId,
      evidenceComplete: !!session.material && session.context.evidence.length > 0 && (session.task.type === 'MATERIAL' || !!session.impact), approved });
    return { def, args, decision };
  }
  async call(actor: Actor, session: Session, call: ToolCall): Promise<ToolResult> {
    const started = performance.now();
    try {
      const { def, args, decision } = this.policy(actor, session, call);
      this.store.event({ sessionId: session.id, requestId: call.requestId, type: 'POLICY', toolName: def.name, argsHash: hash(args), policyDecision: decision });
      if (decision.action === 'DENY') throw new AppError('POLICY_DENIED', decision.reasons.join(','), 403);
      if (decision.action === 'APPROVAL') {
        const p = session.proposal!;
        const existing = session.approvalId ? this.store.getApproval(session.approvalId) : undefined;
        if (existing?.decision === 'REJECTED' && existing.proposalId === p.id) throw new AppError('APPROVAL_REJECTED', 'proposal version rejected', 409);
        const a: Approval = existing?.decision === 'PENDING' ? existing : { id: randomUUID(), sessionId: session.id, proposalId: p.id, proposalVersion: p.version, toolName: def.name, argsHash: p.argsHash, idempotencyKey: p.idempotencyKey, decision: 'PENDING' };
        session.approvalId = a.id;
        return { requestId: call.requestId, ok: false, data: a, errorCode: 'APPROVAL_REQUIRED', evidenceRefs: [], latencyMs: performance.now() - started };
      }
      let data: unknown;
      if (def.risk === 0) {
        data = await this.read(def.name, args);
        if (def.output) data = def.output.parse(data);
        if (def.name === 'search_material') {
          const returned = z.array(z.object({ material: materialSchema, score: z.number().min(0).max(1), reasons: z.array(z.string()) }).strict()).parse(data);
          const checked = searchMaterials(returned.map(c => c.material), args as unknown as import('../domain/types.js').MaterialQuery);
          if (checked.length !== returned.length || new Set(returned.map(c => c.material.id)).size !== returned.length) throw new AppError('INVALID_DATA', 'candidate contradicts requested query or contains duplicate identifiers');
          data = checked;
        }
        if (def.name === 'get_material_detail' && (hash(data) !== hash(session.material) || (data as import('../domain/types.js').Material).id !== args.materialId)) throw new AppError('INVALID_DATA', 'detail differs from selected material evidence');
        if (def.name === 'get_inventory' || def.name === 'get_purchase_history') if ((data as { materialId: string }[]).some(row => row.materialId !== args.materialId)) throw new AppError('INVALID_DATA', 'data record material binding mismatch');
      } else if (def.name === 'record_attribution') {
        const ids = args.evidenceIds as string[];
        if (args.materialId !== session.material?.id || ids.some(id => !session.context.evidence.some(e => e.evidenceId === id))) throw new AppError('INVALID_DATA', 'attribution references unverified evidence');
        data = args;
      } else if (def.name === 'check_duplicate') data = duplicateCheck(session.material!, this.records<Inventory>(session, 'get_inventory'), this.records<Purchase>(session, 'get_purchase_history'));
      else if (def.name === 'estimate_purchase_impact') data = estimateImpact(session.task, session.material!, this.records<Inventory>(session, 'get_inventory'), this.records<Purchase>(session, 'get_purchase_history'));
      else if (def.risk === 2) { this.store.saveProposal(session.proposal!); data = session.proposal; }
      else {
        const p = session.proposal!, saved = this.store.erpResult(p.idempotencyKey);
        if (saved && saved.argsHash !== p.argsHash) throw new AppError('IDEMPOTENCY_CONFLICT', 'ERP key binding differs', 409);
        data = saved?.result ?? this.store.executeERP(p); this.store.recordExecution(p, data);
      }
      const refs = def.readonly ? [this.store.addEvidence(session.id, def.name, String(args.materialId ?? session.id), data).ref] : [];
      session.context.evidence.push(...refs); session.context.toolTrace.push(`${def.name}:${call.requestId}`);
      const result: ToolResult = { requestId: call.requestId, ok: true, data, evidenceRefs: refs, latencyMs: performance.now() - started };
      this.store.event({ sessionId: session.id, requestId: call.requestId, type: 'TOOL_RESULT', toolName: def.name, argsHash: hash(args), resultSummary: def.name === 'search_material' ? `${(data as Candidate[]).length} candidates` : 'validated result persisted', evidenceRefs: refs, latencyMs: result.latencyMs });
      return result;
    } catch (e) {
      const errorCode = e instanceof AppError ? e.code : e instanceof z.ZodError ? 'INVALID_DATA' : 'TOOL_ERROR';
      this.store.event({ sessionId: session.id, requestId: call.requestId, type: 'TOOL_ERROR', toolName: call.toolName, argsHash: hash(call.args), resultSummary: errorCode, policyDecision: { action: 'DENY', reasons: [errorCode] }, latencyMs: performance.now() - started });
      return { requestId: call.requestId, ok: false, errorCode, evidenceRefs: [], latencyMs: performance.now() - started };
    }
  }
  records<T>(session: Session, source: string): T[] {
    const all = this.store.list<import('../domain/types.js').Evidence>('evidence', session.id);
    const record = all.filter(e => e.ref.source === source && e.ref.recordId === session.material?.id).at(-1);
    if (!record) throw new AppError('NEED_MORE_EVIDENCE', `missing ${source} evidence`);
    return record.data as T[];
  }
  private async read(name: string, args: Record<string, unknown>) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([this.source.call(name, args), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AppError('TOOL_TIMEOUT', 'read tool timed out', 504)), this.timeoutMs); })]); }
      catch (e) { if (attempt === 2 || (e instanceof AppError && !['TOOL_TIMEOUT', 'TOOL_ERROR'].includes(e.code))) throw e; }
      finally { if (timer) clearTimeout(timer); }
    }
    throw new AppError('TOOL_ERROR', 'retry budget exhausted');
  }
}
