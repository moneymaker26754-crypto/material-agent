import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Application } from './agent/workflow.js';
import { Store } from './session/store.js';
import { configuredTokens, runtime } from './config.js';
import { runBenchmark, formatReport } from './benchmark/runner.js';
import { AppError, type Task } from './domain/types.js';
const args = process.argv.slice(2);
function flag(name: string) { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1]; }
function payload(): unknown { const path = flag('task-file'); const value = path ? readFileSync(path, 'utf8') : flag('task'); if (!value) throw new AppError('CLI_USAGE', '--task-file path or --task JSON required'); return JSON.parse(value); }
function output(value: unknown) { console.log(JSON.stringify(value, null, 2)); }
const help = `Material Agent API/CLI\n  session create --task-file examples/purchase.json\n  session run|show|resume <session-id>\n  session supplement <session-id> --task '{"specification":"6204"}'\n  approval list\n  approval decide <approval-id> --decision APPROVED|REJECTED --reason text\n  events <session-id>\n  demo\n  benchmark [--json] [--output data/benchmark.json]\n身份由 MATERIAL_TOKEN 与 AUTH_TOKENS 配置映射；支持 Node --env-file。`;
async function main() {
  if (!args[0] || args[0] === '--help') { console.log(help); return; }
  if (args[0] === 'benchmark') {
    const report = await runBenchmark(), path = flag('output'); if (path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(report, null, 2)); }
    if (args.includes('--json')) output(report); else console.log(formatReport(report));
    if (report.cases.some(c => !c.passed) || report.unauthorizedWrites) process.exitCode = 1; return;
  }
  if (args[0] === 'demo') {
    const store = new Store(':memory:');
    try { const app = new Application(store), user = { userId: 'demo-user', role: 'USER' as const }, reviewer = { userId: 'demo-reviewer', role: 'REVIEWER' as const };
      const waiting = await app.run(user, app.create(user, { type: 'PURCHASE', query: 'BRG-6204', demand: 20, safetyStock: 3, requestedQuantity: 15 }).id);
      if (waiting.state !== 'WAITING_APPROVAL') throw new AppError('DEMO_FAILED', waiting.error ?? waiting.state);
      app.decide(reviewer, waiting.approvalId!, 'APPROVED', '合成场景人工审批演示'); const final = await app.run(user, waiting.id);
      output({ mode: 'synthetic-offline', waitingState: waiting.state, finalState: final.state, attribution: final.material, duplicate: final.duplicate, impact: final.impact, evidenceCount: app.evidence(user, final.id).length, erpWrites: store.erpCount(), result: final.result });
      if (final.state !== 'COMPLETED') process.exitCode = 1;
    } finally { store.close(); } return;
  }
  const tokens = configuredTokens(), actor = tokens[process.env.MATERIAL_TOKEN ?? ''];
  if (!actor) throw new AppError('UNAUTHORIZED', 'MATERIAL_TOKEN must match configured AUTH_TOKENS', 401);
  const service = runtime(), app = service.app;
  try {
    const id = args[2];
    if (args[0] === 'session' && args[1] === 'create') output(app.create(actor, payload() as Task));
    else if (args[0] === 'session' && ['run', 'resume'].includes(args[1] ?? '') && id) output(await app.run(actor, id));
    else if (args[0] === 'session' && args[1] === 'show' && id) output(app.get(actor, id, true));
    else if (args[0] === 'session' && args[1] === 'supplement' && id) output(app.supplement(actor, id, payload() as Partial<Task>));
    else if (args[0] === 'approval' && args[1] === 'list') output(app.approvals(actor));
    else if (args[0] === 'approval' && args[1] === 'decide' && id) output(app.decide(actor, id, flag('decision') as 'APPROVED' | 'REJECTED', flag('reason') ?? ''));
    else if (args[0] === 'events' && args[1]) output(app.events(actor, args[1]));
    else throw new AppError('CLI_USAGE', help);
  } finally { await service.close(); }
}
main().catch(e => { console.error(JSON.stringify({ errorCode: e instanceof AppError ? e.code : 'INVALID_DATA', message: e instanceof Error ? e.message : 'error' })); process.exitCode = 1; });
