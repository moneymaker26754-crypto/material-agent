import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { materials, inventory, purchases } from '../domain/fixtures.js';
import { AppError, type AgentEvent, type Approval, type Evidence, type Material, type Proposal, type Session } from '../domain/types.js';
import { normalize } from '../domain/rules.js';
export const hash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
type Table = 'sessions' | 'approvals' | 'proposals' | 'evidence' | 'events' | 'executions' | 'erp_actions' | 'materials' | 'inventory' | 'purchases';
export interface CheckpointChanges { approval?: Approval; event?: Omit<AgentEvent, 'id' | 'createdAt'>; invalidateApprovals?: boolean; requireIdle?: boolean }
export class Store {
  readonly db: DatabaseSync;
  private closed = false;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path); this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);');
    if (!this.db.prepare('SELECT version FROM migrations WHERE version=1').get()) this.transaction(() => {
      for (const table of ['sessions', 'approvals', 'proposals', 'evidence', 'events', 'executions', 'erp_actions', 'materials', 'inventory', 'purchases']) this.db.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY, session_id TEXT, body TEXT NOT NULL); CREATE INDEX ${table}_session ON ${table}(session_id);`);
      this.db.exec('CREATE TABLE checkpoints(id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE leases(session_id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);');
      for (const m of materials) this.put('materials', m.id, null, m);
      for (const i of inventory) this.put('inventory', i.id, null, i);
      for (const p of purchases) this.put('purchases', p.id, null, p);
      this.db.exec('INSERT INTO migrations VALUES(1);');
    });
  }
  transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const value = fn(); this.db.exec('COMMIT'); return value; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  private put(table: Table, id: string, sessionId: string | null, body: unknown) { this.db.prepare(`INSERT INTO ${table}(id,session_id,body) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,session_id=excluded.session_id`).run(id, sessionId, JSON.stringify(body)); }
  private get<T>(table: Table, id: string): T | undefined { const row = this.db.prepare(`SELECT body FROM ${table} WHERE id=?`).get(id); return row ? JSON.parse(String(row.body)) as T : undefined; }
  list<T>(table: Table, sessionId?: string): T[] { return (sessionId === undefined ? this.db.prepare(`SELECT body FROM ${table} ORDER BY rowid`).all() : this.db.prepare(`SELECT body FROM ${table} WHERE session_id=? ORDER BY rowid`).all(sessionId)).map(r => JSON.parse(String(r.body)) as T); }
  insertSession(s: Session) { this.transaction(() => { this.put('sessions', s.id, s.id, s); this.db.prepare('INSERT INTO checkpoints(session_id,version,body) VALUES(?,?,?)').run(s.id, s.version, JSON.stringify(s)); }); }
  getSession(id: string): Session { const s = this.get<Session>('sessions', id); if (!s) throw new AppError('NOT_FOUND', 'session not found', 404); return s; }
  saveSession(s: Session, changes: CheckpointChanges = {}) { this.transaction(() => {
    if (changes.requireIdle) this.assertNotRunning(s.id);
    const current = this.getSession(s.id); if (current.version !== s.version) throw new AppError('VERSION_CONFLICT', 'checkpoint version changed', 409);
    const next = { ...s, version: s.version + 1 }; this.put('sessions', s.id, s.id, next);
    this.db.prepare('INSERT INTO checkpoints(session_id,version,body) VALUES(?,?,?)').run(s.id, next.version, JSON.stringify(next));
    if (changes.invalidateApprovals) this.invalidateApprovals(s.id);
    if (changes.approval) this.saveApproval(changes.approval);
    if (changes.event) this.event(changes.event);
    s.version = next.version;
  }); }
  acquire(id: string, owner: string) { this.transaction(() => {
    const lease = this.db.prepare('SELECT owner,expires FROM leases WHERE session_id=?').get(id);
    if (lease && Number(lease.expires) > Date.now()) throw new AppError('SESSION_BUSY', 'session already running', 409);
    this.db.prepare('INSERT OR REPLACE INTO leases VALUES(?,?,?)').run(id, owner, Date.now() + 120000);
  }); }
  renew(id: string, owner: string) { const result = this.db.prepare('UPDATE leases SET expires=? WHERE session_id=? AND owner=?').run(Date.now() + 120000, id, owner); if (!result.changes) throw new AppError('SESSION_BUSY', 'execution lease lost', 409); }
  release(id: string, owner: string) { this.db.prepare('DELETE FROM leases WHERE session_id=? AND owner=?').run(id, owner); }
  assertNotRunning(id: string) { const row = this.db.prepare('SELECT expires FROM leases WHERE session_id=?').get(id); if (row && Number(row.expires) > Date.now()) throw new AppError('SESSION_BUSY', 'cannot edit a running session', 409); }
  addEvidence(sessionId: string, source: string, recordId: string, data: unknown): Evidence { const e: Evidence = { ref: { evidenceId: randomUUID(), source, recordId }, data, createdAt: new Date().toISOString() }; this.put('evidence', e.ref.evidenceId, sessionId, e); return e; }
  event(event: Omit<AgentEvent, 'id' | 'createdAt'>) { const e = { ...event, id: randomUUID(), createdAt: new Date().toISOString() }; this.put('events', e.id, e.sessionId, e); return e; }
  saveProposal(p: Proposal) { this.put('proposals', p.id, p.sessionId, p); }
  getApproval(id: string): Approval { const a = this.get<Approval>('approvals', id); if (!a) throw new AppError('NOT_FOUND', 'approval not found', 404); return a; }
  saveApproval(a: Approval) { this.put('approvals', a.id, a.sessionId, a); }
  invalidateApprovals(sessionId: string) { for (const a of this.list<Approval>('approvals', sessionId)) if (a.decision !== 'INVALIDATED') this.saveApproval({ ...a, decision: 'INVALIDATED' }); }
  getMaterial(id: string) { return this.get<Material>('materials', id); }
  execution(key: string) { return this.get<{ argsHash: string; result: unknown }>('executions', key); }
  recordExecution(p: Proposal, result: unknown) { this.put('executions', p.idempotencyKey, p.sessionId, { argsHash: p.argsHash, result }); }
  erpResult(key: string) { return this.get<{ argsHash: string; result: { id: string; type: string; payload: Proposal['payload'] } }>('erp_actions', key); }
  executeERP(p: Proposal) { return this.transaction(() => {
    const existing = this.erpResult(p.idempotencyKey);
    if (existing) { if (existing.argsHash !== p.argsHash) throw new AppError('IDEMPOTENCY_CONFLICT', 'same key with different arguments', 409); return existing.result; }
    const result = { id: randomUUID(), type: p.type, payload: p.payload };
    if (p.type === 'MATERIAL') {
      const same = this.list<Material>('materials').some(m => m.id === p.payload.material.id || normalize(m.code) === normalize(p.payload.material.code));
      if (same) throw new AppError('MATERIAL_CONFLICT', 'material identifier already exists', 409);
      this.put('materials', p.payload.material.id, null, p.payload.material);
    } else this.put('purchases', result.id, null, { id: result.id, materialId: p.payload.material.id, quantity: p.payload.quantity, received: 0, status: 'CONFIRMED' });
    this.put('erp_actions', p.idempotencyKey, p.sessionId, { argsHash: p.argsHash, result }); return result;
  }); }
  erpCount() { return Number(this.db.prepare('SELECT count(*) AS n FROM erp_actions').get()!.n); }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
}
