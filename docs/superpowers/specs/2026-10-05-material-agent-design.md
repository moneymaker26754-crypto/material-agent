# Material Agent 已确认设计

## 目标与边界
实现物料数据治理与采购决策辅助系统的完整 API + CLI 链路。数据为合成示例，ERP 为可持久化的模拟系统。提供真实模型和 MCP/CLI 适配，不接入生产 ERP，不提供 Web 前端，不部署线上服务。

## 架构
Node.js 24 + TypeScript strict/ESM + Fastify + SQLite + Vitest；pi-agent-core/pi-ai 1.0.2；官方 MCP v2。Agent 管理推理与工具选择；显式状态机管理业务阶段；所有工具通过统一 Router/Harness。

## 业务
编码、名称、别名、规格检索，规范化后校验规格和单位；歧义进入 NEED_MORE_EVIDENCE。重复校验关联主数据、有效库存、未完成采购。建议采购量=max(0,需求+安全库存-可用库存-已确认在途)，冻结/报废和已完成订单不计入；金额用分存储。

## 控制与恢复
服务端定义风险 L0-L3。L3 必须审批；审批绑定会话、动作、参数摘要、提案版本和幂等键。业务用户访问自己的会话，审批者可审批和审计。Bearer token 的身份来自配置，不能由请求伪造。修改提案使旧审批失效；拒绝后同版本不能执行。

状态迁移、证据、事件、checkpoint、审批和执行记录均持久化。恢复首先查询 ERP 的幂等结果；同键异参冲突。读取限次重试，结果不确定的写操作进入 RECOVERABLE。上下文保留五层及原始证据引用。

## 交付与验证
九类工具、MCP stdio 服务/客户端、白名单 CLI JSON 适配器、API/OpenAPI、CLI、合成数据、七指标 Benchmark。Windows/Linux Node 24 CI。测试覆盖歧义、缺失、脏数据、越权、审批拒绝/失效、重启、写后中断、重复提交及并发恢复。

中文 README 仅介绍定位/问题/技术/框架。独立 Markdown 和 Word 项目梳理，Word 渲染逐页检查。公开 GitHub 仓库 moneymaker26754-crypto/material-agent，提交与推送代码、测试、合成数据和文档。
