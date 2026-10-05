export type State = 'RECEIVED' | 'DISCOVERY' | 'EVIDENCE_READY' | 'ATTRIBUTION' | 'DUPLICATE_CHECK' | 'IMPACT_ESTIMATION' | 'PROPOSAL_READY' | 'POLICY_CHECK' | 'WAITING_APPROVAL' | 'EXECUTING' | 'VERIFYING' | 'COMPLETED' | 'NEED_MORE_EVIDENCE' | 'RECOVERABLE' | 'FAILED';
export interface Actor { userId: string; role: 'USER' | 'REVIEWER' }
export interface Material { id: string; code: string; name: string; aliases: string[]; specification: string; unit: string; currency: string; unitPriceMinor: number }
export interface Inventory { id: string; materialId: string; quantity: number; reserved: number; status: 'AVAILABLE' | 'FROZEN' | 'SCRAPPED' }
export interface Purchase { id: string; materialId: string; quantity: number; received: number; status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' }
export interface MaterialQuery { query: string; specification?: string; unit?: string; materialId?: string }
export interface Task extends MaterialQuery { type: 'PURCHASE' | 'MATERIAL'; demand?: number; safetyStock?: number; requestedQuantity?: number; newMaterial?: Material }
export interface Candidate { material: Material; score: number; reasons: string[] }
export interface DuplicateCheck { duplicate: boolean; reasons: string[]; availableQuantity: number; onOrderQuantity: number; historicalPurchaseIds: string[] }
export interface Impact { availableQuantity: number; onOrderQuantity: number; recommendedQuantity: number; projectedInventory: number; shortageQuantity: number; excessQuantity: number; requestedCostMinor: number; recommendedCostMinor: number; currency: string; unit: string }
export interface EvidenceRef { evidenceId: string; source: string; recordId: string }
export interface Evidence { ref: EvidenceRef; data: unknown; createdAt: string }
export interface Proposal { id: string; sessionId: string; version: number; type: 'MATERIAL' | 'PURCHASE'; payload: { material: Material; quantity?: number }; evidence: EvidenceRef[]; argsHash: string; idempotencyKey: string }
export interface PolicyDecision { action: 'ALLOW' | 'APPROVAL' | 'DENY'; reasons: string[] }
export interface ToolCall { requestId: string; sessionId: string; toolName: string; args: unknown; riskLevel?: number; idempotencyKey?: string }
export interface ToolResult { requestId: string; ok: boolean; data?: unknown; evidenceRefs: EvidenceRef[]; errorCode?: string; latencyMs: number }
export interface Approval { id: string; sessionId: string; proposalId: string; proposalVersion: number; toolName: string; argsHash: string; idempotencyKey: string; decision: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INVALIDATED'; reviewer?: string; reason?: string }
export interface AgentEvent { id: string; sessionId: string; requestId: string; type: string; stateBefore?: State; stateAfter?: State; toolName?: string; argsHash?: string; resultSummary?: string; evidenceRefs?: EvidenceRef[]; policyDecision?: PolicyDecision; latencyMs?: number; tokenUsage?: { input: number; output: number }; finalOutcome?: string; createdAt: string }
export interface ContextPack { task: Task; evidence: EvidenceRef[]; toolTrace: string[]; state: State; policy: string[] }
export interface Session { id: string; userId: string; state: State; task: Task; version: number; candidates: Candidate[]; material?: Material; duplicate?: DuplicateCheck; impact?: Impact; proposal?: Proposal; approvalId?: string; result?: unknown; error?: string; resumeState?: State; context: ContextPack; createdAt: string }
export class AppError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
