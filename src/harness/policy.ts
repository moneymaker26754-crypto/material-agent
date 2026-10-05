import type { PolicyDecision } from '../domain/types.js';
export function preToolUse(input: { risk: number; stateAllowed: boolean; authorized: boolean; evidenceComplete: boolean; approved: boolean }): PolicyDecision {
  if (!input.authorized) return { action: 'DENY', reasons: ['actor_not_authorized'] };
  if (!input.stateAllowed) return { action: 'DENY', reasons: ['tool_not_allowed_in_state'] };
  if (input.risk >= 2 && !input.evidenceComplete) return { action: 'DENY', reasons: ['incomplete_or_ambiguous_evidence'] };
  if (input.risk === 3 && !input.approved) return { action: 'APPROVAL', reasons: ['high_risk_write_requires_approval'] };
  return { action: 'ALLOW', reasons: [input.risk === 3 ? 'approval_binding_verified' : 'registered_tool_policy'] };
}
