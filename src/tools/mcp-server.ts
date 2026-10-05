import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { Store } from '../session/store.js';
import { LocalDataSource } from './data-source.js';
import { definitions } from './registry.js';
const store = new Store(process.env.MATERIAL_DATA_DB ?? ':memory:');
const source = new LocalDataSource(store);
const server = new McpServer({ name: 'material-data-bus', version: '1.0.0' });
for (const def of definitions.filter(d => d.risk === 0)) server.registerTool(def.name, { description: def.description, inputSchema: def.schema, annotations: { readOnlyHint: true, destructiveHint: false } }, async args => {
  const data = await source.call(def.name, args as Record<string, unknown>);
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
});
process.on('exit', () => store.close());
await server.connect(new StdioServerTransport());
