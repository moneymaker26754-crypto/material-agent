import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { AppError } from '../domain/types.js';
import { definitions } from './registry.js';
import type { DataSource } from './data-source.js';
export interface ProcessConfig { command: string; args: string[]; env?: Record<string, string> }
const dataTools = definitions.filter(d => d.risk === 0).map(d => d.name);
function checkName(name: string) { if (!dataTools.includes(name)) throw new AppError('UNKNOWN_TOOL', 'only registered read data tools are allowed'); }
export class CliDataSource implements DataSource {
  constructor(private config: ProcessConfig, private timeoutMs = 10000) {}
  async listTools() { return dataTools; }
  async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    checkName(name); definitions.find(d => d.name === name)!.schema.parse(args);
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.command, this.config.args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: this.config.env ? { ...process.env, ...this.config.env } : process.env });
      let output = '', settled = false;
      const finish = (error?: Error, value?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
      const timer = setTimeout(() => { child.kill(); finish(new AppError('TOOL_TIMEOUT', 'CLI timeout', 504)); }, this.timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); if (Buffer.byteLength(output) > 1_000_000) { child.kill(); finish(new AppError('INVALID_DATA', 'CLI result exceeds size limit')); } });
      child.stderr.resume(); child.on('error', e => finish(new AppError('TOOL_ERROR', e.message)));
      child.on('close', code => {
        if (settled) return;
        try { const envelope = JSON.parse(output) as { ok?: boolean; data?: unknown; errorCode?: string };
          if (code !== 0 || !envelope.ok) finish(new AppError(envelope.errorCode ?? 'TOOL_ERROR', 'CLI data call failed')); else finish(undefined, envelope.data);
        } catch { finish(new AppError('INVALID_DATA', 'CLI did not return valid JSON')); }
      });
      child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify({ toolName: name, args }));
    });
  }
}
export class McpDataSource implements DataSource {
  private client = new Client({ name: 'material-agent', version: '1.0.0' });
  private transport: StdioClientTransport;
  private connected?: Promise<void>;
  constructor(config: ProcessConfig, private timeoutMs = 10000) { this.transport = new StdioClientTransport({ command: config.command, args: config.args, env: config.env, stderr: 'pipe' }); }
  private async connect() { this.connected ??= this.client.connect(this.transport, { timeout: this.timeoutMs }); await this.connected; this.transport.stderr?.on('data', () => {}); }
  async listTools() { await this.connect(); const { tools } = await this.client.listTools(); return tools.map(t => t.name); }
  async call(name: string, args: Record<string, unknown>) {
    checkName(name); definitions.find(d => d.name === name)!.schema.parse(args); await this.connect();
    const result = await this.client.callTool({ name, arguments: args }, { timeout: this.timeoutMs });
    if (result.isError) throw new AppError('TOOL_ERROR', 'MCP server returned tool error');
    const content = result.content.find(c => c.type === 'text');
    if (!content || content.type !== 'text') throw new AppError('INVALID_DATA', 'MCP text result missing');
    try { return JSON.parse(content.text) as unknown; } catch { throw new AppError('INVALID_DATA', 'MCP result is not JSON'); }
  }
  async close() { await this.client.close(); }
}
