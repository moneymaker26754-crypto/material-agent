import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { taskSchema } from '../domain/schemas.js';
import { AppError, type Actor, type Task } from '../domain/types.js';
import type { Application } from '../agent/workflow.js';
const params = z.object({ id: z.string().min(1).max(200) }).strict();
const taskBody = z.object({ task: taskSchema }).strict();
const patchBody = z.object({ patch: taskSchema.partial() }).strict();
const decisionBody = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(1000) }).strict();
const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-7' });
export function createServer(app: Application, tokens: Record<string, Actor>) {
  const server = Fastify({ logger: false, bodyLimit: 100000, ajv: { customOptions: { removeAdditional: false, coerceTypes: false } } });
  server.register(swagger, { openapi: { info: { title: 'Material Agent API', version: '1.0.0' }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } } });
  const identities = new WeakMap<object, Actor>();
  server.addHook('preHandler', async request => {
    if (request.routeOptions.url === '/health' || request.routeOptions.url === '/openapi.json') return;
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED', 'Bearer token required', 401);
    const supplied = Buffer.from(authorization.slice(7));
    const entry = Object.entries(tokens).find(([token]) => { const expected = Buffer.from(token); return supplied.length === expected.length && timingSafeEqual(supplied, expected); });
    if (!entry) throw new AppError('UNAUTHORIZED', 'invalid token', 401); identities.set(request, entry[1]);
  });
  server.setErrorHandler((error, _request, reply) => {
    const status = error instanceof AppError ? error.status : error instanceof z.ZodError || (error as { validation?: unknown }).validation ? 400 : 500;
    reply.status(status).send({ errorCode: error instanceof AppError ? error.code : status === 400 ? 'INVALID_DATA' : 'INTERNAL_ERROR', message: status === 500 ? 'internal error' : error instanceof Error ? error.message : 'invalid request' });
  });
  server.after(() => {
  const authenticated = { security: [{ bearerAuth: [] }] };
  server.get('/health', async () => ({ ok: true, modelMode: app.planner.config.mode, dataMode: app.router.source.constructor.name }));
  server.get('/openapi.json', async () => server.swagger());
  server.post('/sessions', { schema: { ...authenticated, body: json(taskBody) } }, async (request, reply) => { const input = taskBody.parse(request.body); return reply.status(201).send(app.create(identities.get(request)!, input.task)); });
  server.get('/sessions/:id', { schema: { ...authenticated, params: json(params) } }, async request => app.get(identities.get(request)!, params.parse(request.params).id, true));
  for (const operation of ['run', 'resume']) server.post(`/sessions/:id/${operation}`, { schema: { ...authenticated, params: json(params) } }, async request => app.run(identities.get(request)!, params.parse(request.params).id));
  server.post('/sessions/:id/evidence', { schema: { ...authenticated, params: json(params), body: json(patchBody) } }, async request => app.supplement(identities.get(request)!, params.parse(request.params).id, patchBody.parse(request.body).patch as Partial<Task>));
  server.get('/sessions/:id/evidence', { schema: { ...authenticated, params: json(params) } }, async request => app.evidence(identities.get(request)!, params.parse(request.params).id));
  server.get('/sessions/:id/events', { schema: { ...authenticated, params: json(params) } }, async request => app.events(identities.get(request)!, params.parse(request.params).id));
  server.get('/sessions/:id/proposal', { schema: { ...authenticated, params: json(params) } }, async request => app.get(identities.get(request)!, params.parse(request.params).id, true).proposal ?? null);
  server.get('/approvals', { schema: authenticated }, async request => app.approvals(identities.get(request)!));
  server.post('/approvals/:id/decision', { schema: { ...authenticated, params: json(params), body: json(decisionBody) } }, async request => { const body = decisionBody.parse(request.body); return app.decide(identities.get(request)!, params.parse(request.params).id, body.decision, body.reason); });
  });
  return server;
}
