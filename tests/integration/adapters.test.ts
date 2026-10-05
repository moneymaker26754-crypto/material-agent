import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { CliDataSource, McpDataSource } from '../../src/tools/adapters.js';
const cliPath = fileURLToPath(new URL('../../src/tools/data-cli.ts', import.meta.url));
const mcpPath = fileURLToPath(new URL('../../src/tools/mcp-server.ts', import.meta.url));
it('discovers real MCP stdio tools and calls the material service', async () => {
  const source = new McpDataSource({ command: process.execPath, args: ['--import', 'tsx', mcpPath] });
  try { expect(await source.listTools()).toContain('search_material'); expect(await source.call('search_material', { query: 'BRG-6204' })).toMatchObject([{ material: { id: 'm-bearing-6204' } }]); }
  finally { await source.close(); }
});
it('rejects invalid MCP tool parameters', async () => {
  const source = new McpDataSource({ command: process.execPath, args: ['--import', 'tsx', mcpPath] });
  try { await expect(source.call('get_inventory', {})).rejects.toThrow(); } finally { await source.close(); }
});
it('uses an allowlisted JSON CLI subprocess with no shell interpolation', async () => {
  const source = new CliDataSource({ command: process.execPath, args: ['--import', 'tsx', cliPath] });
  expect(await source.listTools()).toContain('get_inventory');
  expect(await source.call('get_inventory', { materialId: 'm-bearing-6204' })).toEqual(expect.arrayContaining([expect.objectContaining({ quantity: 10, reserved: 2, status: 'AVAILABLE' })]));
  await expect(source.call('arbitrary_shell', { query: '$(echo unsafe)' })).rejects.toMatchObject({ code: 'UNKNOWN_TOOL' });
});
it('terminates timed out CLI reads and maps invalid output', async () => {
  const slow = new CliDataSource({ command: process.execPath, args: ['-e', 'setTimeout(()=>{},5000)'] }, 100);
  await expect(slow.call('search_material', { query: 'x' })).rejects.toMatchObject({ code: 'TOOL_TIMEOUT' });
  const dirty = new CliDataSource({ command: process.execPath, args: ['-e', 'console.log("not json")'] });
  await expect(dirty.call('search_material', { query: 'x' })).rejects.toMatchObject({ code: 'INVALID_DATA' });
});
