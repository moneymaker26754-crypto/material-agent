# Material Agent Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Final fresh review uses superpowers:requesting-code-review.

**Goal:** 可追溯、受控、可恢复、可评测的物料治理与采购辅助 API + CLI。

**Architecture:** 显式状态机 + pi 推理适配 + 统一 Tool Router/Harness；SQLite 持久化证据、状态和模拟 ERP。规则与模型分离，所有写入绑定审批和幂等。

**Tech Stack:** Node.js 24 / TypeScript / Fastify / SQLite / pi 1.0.2 / MCP v2 / Vitest。

**Spec:** ../specs/2026-10-05-material-agent-design.md

## Global Constraints
- TypeScript strict、ESM、Windows/Linux Node.js 24；依赖锁定。
- 无 Web 前端、无生产 ERP、无线上部署；合成数据，真实模型独立验证。
- README 仅介绍项目定位、业务问题、技术和框架。
- 身份/风险服务端确定，L3 必须审批，幂等键异参冲突。

## Review Focus
- 运行中并发恢复必须串行，不能重复写入。
- 已完成采购不计入在途，冻结/报废不计入可用库存。
- 提案修改和审批拒绝后不能复用授权。
- 恢复时 ERP 已执行但 checkpoint 未保存不能重写。
- 工具/模型返回脏数据不能绕过领域校验。

### Task 1: Domain and foundation
**Files:** src/domain/{types,rules,fixtures}.ts; tests/unit/domain.test.ts; package.json.
**Interfaces:** searchMaterials(MaterialQuery)->Candidate[]; duplicateCheck(Material,Inventory[],Purchase[])->DuplicateCheck; estimateImpact(Task,Inventory[],Purchase[])->Impact.
- [ ] Write failing tests with independently derived quantities and amounts; run npm test -- tests/unit/domain.test.ts (expected fail).
- [ ] Implement normalization, filtering, attribution and deterministic calculations; rerun (expected pass), commit.

### Task 2: Persistence, state, tools and pi
**Files:** src/session/store.ts; src/agent/{state,planner,workflow}.ts; src/context/manager.ts; src/harness/policy.ts; src/tools/{registry,router,adapters,mcp-server,data-cli}.ts; tests/integration/ and tests/e2e/.
**Interfaces:** Store(session, evidence, proposal, approval, event, execution); Application.create/run/supplement/decide; ToolRouter.call(ToolCall)->ToolResult.
- [ ] Write red tests for read workflow, approvals, stale/rejected decisions, restart, idempotency, cross-session auth, process transports and pi stream.
- [ ] Implement each subsystem until named tests pass, run full suite, commit.
- [ ] Maintain transaction boundaries and ERP reconciliation; record explicit failure-injection results.

### Task 3: API, CLI and benchmark
**Files:** src/api/server.ts; src/cli.ts; src/benchmark/runner.ts; tests/integration/api.test.ts; tests/benchmark/runner.test.ts; .github/workflows/ci.yml.
**Interfaces:** Fastify authenticated routes/OpenAPI; CLI application service; BenchmarkReport seven metrics.
- [ ] Write red API auth/validation and seven-metric case tests; run and observe failures.
- [ ] Implement routes, CLI, labeled cases, machine/human reports and Windows/Linux CI; run typecheck/build/test/demo/benchmark, commit.

### Task 4: Documentation and delivery
**Files:** README.md; docs/project-overview.md; docs/project-overview.docx; scripts/create-document.py.
- [ ] Write docs from verified behavior and real results; generate Word and render/review every page.
- [ ] Fresh whole-project review; reproduce Important findings with failing tests, fix, run full suite.
- [ ] Create public repository, push main, inspect remote commit and CI; deliver links and explicit verification limits.
