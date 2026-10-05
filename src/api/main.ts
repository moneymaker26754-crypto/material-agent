import { configuredTokens, runtime } from '../config.js';
import { createServer } from './server.js';
const tokens = configuredTokens(), service = runtime(), server = createServer(service.app, tokens);
async function shutdown() { await server.close(); await service.close(); }
process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
try { const address = await server.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000) }); console.log(JSON.stringify({ address, modelMode: service.app.planner.config.mode })); }
catch (e) { await shutdown(); throw e; }
