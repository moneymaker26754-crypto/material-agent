# Material Agent

面向 ERP 物料主数据治理与采购决策辅助的 Agent 工程系统。

## 解决的问题

物料名称、别名和规格分散在不同业务系统中，人员难以定位正确物料；历史采购和库存信息需要人工拼接，容易产生重复录入、重复采购及积压。直接让大模型执行采购或修改主数据，又缺少权限、审批和结果核验。

## 技术方案

系统将物料检索、证据归因、重复校验、采购影响测算和提案组织为显式状态机。Agent 根据当前阶段调用工具；物料约束、数量测算和执行权限由确定性规则控制。

- **证据归因：** 按编码、名称、别名和规格检索候选物料，以持久化证据关联采购与库存来源；歧义与字段缺失进入补充证据流程。
- **工具治理：** MCP/CLI 数据总线统一工具访问，PreToolUse Harness 校验阶段、身份、参数、风险、审批与幂等绑定。
- **受控执行：** 高风险动作必须经过人工审批；审批绑定提案版本和参数摘要，提案改版后旧授权失效。
- **可靠恢复：** SQLite 持久化会话、checkpoint、审批和执行轨迹，恢复时核对 ERP 幂等记录，避免重复写入。
- **上下文工程：** 分层保留任务、证据、工具轨迹、状态与策略，压缩历史表达并保留事实引用。
- **评测闭环：** 事件审计支持检索、归因、重复识别、工具选择、权限违规、恢复与端到端七类指标回归。

## 架构与框架

```text
API / CLI → Session → Workflow / pi Agent → Context → Tool Router
                                                  ↓
                                           PreToolUse Harness
                                                  ↓
                                  Local / MCP / CLI Data Source
                                                  ↓
                                      Proposal → Approval
                                                  ↓
                                         Execute → Verify

SQLite：Session / Evidence / Proposal / Approval / Checkpoint / Event / ERP
```

技术栈为 **Node.js 24、TypeScript、Fastify、SQLite、pi SDK、MCP TypeScript SDK v2、Zod 和 Vitest**。pi 提供模型交互与工具调用 Runtime，业务状态机、领域规则、权限和恢复机制由项目实现。

系统提供 API 与 CLI 入口，内置合成业务数据和模拟 ERP，支持本地、MCP stdio 和 CLI JSON 读取适配，以及可配置的真实模型。离线演示使用明确标记的模拟模型流，走相同 pi Runtime 与业务控制链路。
