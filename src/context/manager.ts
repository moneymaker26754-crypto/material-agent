import type { ContextPack } from '../domain/types.js';
export function compactContext(pack: ContextPack, recent = 8): ContextPack {
  const copy = structuredClone(pack);
  if (copy.toolTrace.length > recent) copy.toolTrace = [`${copy.toolTrace.length - recent} earlier tool calls retained in audit events`, ...copy.toolTrace.slice(-recent)];
  return copy;
}
