import { z } from 'zod';
import { Store } from './session/store.js';
import { Application } from './agent/workflow.js';
import { AppError, type Actor } from './domain/types.js';
import { CliDataSource, McpDataSource, type ProcessConfig } from './tools/adapters.js';
import type { DataSource } from './tools/data-source.js';
const actorSchema = z.object({ userId: z.string().min(1), role: z.enum(['USER', 'REVIEWER']) }).strict();
export function configuredTokens(): Record<string, Actor> {
  if (!process.env.AUTH_TOKENS) throw new AppError('CONFIG', 'AUTH_TOKENS JSON is required; see .env.example');
  const tokens = z.record(z.string().min(8), actorSchema).parse(JSON.parse(process.env.AUTH_TOKENS));
  if (!Object.keys(tokens).length) throw new AppError('CONFIG', 'at least one configured token is required'); return tokens;
}
export function runtime() {
  const mode = z.enum(['demo', 'live']).parse(process.env.MODEL_MODE ?? 'demo');
  const provider = z.enum(['openai', 'anthropic', 'compatible']).parse(process.env.MODEL_PROVIDER ?? 'openai');
  const adapter = z.enum(['local', 'mcp', 'cli']).parse(process.env.DATA_ADAPTER ?? 'local');
  const store = new Store(process.env.DATABASE_PATH ?? 'data/material-agent.db');
  try {
    let source: DataSource | undefined;
    if (adapter !== 'local') {
      if (!process.env.DATA_COMMAND) throw new AppError('CONFIG', 'DATA_COMMAND is required for process adapters');
      const config: ProcessConfig = { command: process.env.DATA_COMMAND, args: z.array(z.string()).parse(JSON.parse(process.env.DATA_ARGS ?? '[]')), env: { MATERIAL_DATA_DB: process.env.DATABASE_PATH ?? 'data/material-agent.db' } };
      source = adapter === 'mcp' ? new McpDataSource(config) : new CliDataSource(config);
    }
    const app = new Application(store, { mode, provider, model: process.env.MODEL_NAME, apiKey: process.env.MODEL_API_KEY, baseUrl: process.env.MODEL_BASE_URL }, source);
    return { app, async close() { await source?.close?.(); store.close(); } };
  } catch (e) { store.close(); throw e; }
}
