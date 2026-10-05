import { Store } from '../session/store.js';
import { LocalDataSource } from './data-source.js';
import { definitions } from './registry.js';
const store = new Store(process.env.MATERIAL_DATA_DB ?? ':memory:');
try {
  let text = ''; for await (const chunk of process.stdin) { text += String(chunk); if (Buffer.byteLength(text) > 100000) throw new Error('request too large'); }
  const request = JSON.parse(text) as { toolName: string; args: Record<string, unknown> };
  const def = definitions.find(d => d.name === request.toolName && d.risk === 0); if (!def) throw new Error('unknown tool');
  const args = def.schema.parse(request.args) as Record<string, unknown>;
  console.log(JSON.stringify({ ok: true, data: await new LocalDataSource(store).call(def.name, args) }));
} catch { console.log(JSON.stringify({ ok: false, errorCode: 'INVALID_DATA' })); process.exitCode = 1; }
finally { store.close(); }
