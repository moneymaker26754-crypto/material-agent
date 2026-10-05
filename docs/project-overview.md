# Material Agent 项目梳理

物料数据治理与采购决策辅助系统

## 1. 项目定位与实现边界

本项目面向物料定位困难、重复录入、重复采购和库存积压问题，提供有证据来源、有确定性规则、有人工审批、有中断恢复的 Agent 后端系统。使用入口为 HTTP API 和 CLI，核心业务包括采购提案与物料录入提案。

内置物料、采购和库存记录均为合成示例。ERP 是 SQLite 中可持久化的模拟系统，采购执行生成模拟采购单，物料录入执行更新模拟物料主数据。当前没有接入生产 ERP，也没有线上部署或 Web 前端。

默认 demo 模式使用模拟模型流，经真实 pi Agent Runtime 触发工具调用；live 模式使用真实模型 API，禁止缺少配置时自动回退至 demo。真实模型的调用效果需要独立验证，不能从离线结果推断。

## 2. 技术架构与模块职责

项目采用 Node.js 24、TypeScript strict/ESM、Fastify、Node 内置 SQLite、pi-agent-core/pi-ai 1.0.2、官方 MCP SDK v2、Zod 和 Vitest。依赖固定版本并由 package-lock.json 锁定，CI 使用 npm ci。

| 模块 | 职责 | 主要输出 |
| --- | --- | --- |
| Agent | 阶段推进、模型交互、工具选择 | Session 状态、模型事件 |
| Domain | 检索、数据校验、重复规则、影响测算 | Candidate、DuplicateCheck、Impact |
| Tools | 注册工具、路由与数据接入 | ToolCall、ToolResult、EvidenceRef |
| Harness | 执行前身份、阶段、风险与授权检查 | ALLOW / APPROVAL / DENY |
| Session | SQLite 存储、checkpoint、执行租约 | Session、Approval、Execution |
| Context | 分层上下文与历史轨迹压缩 | ContextPack |
| Verify | 比较 ERP 实际结果与批准提案 | 核验结果 |
| Benchmark | 标注案例与事件指标回归 | JSON 和可读报告 |

数据流为：用户任务 → 会话 → 显式 Workflow → pi Runtime → Tool Router → Harness → 数据源或受控执行 → 结果核验。模型不持有数据库写入接口；工具风险由服务端注册表确定，不接受模型自行降级。

## 3. 业务规则与证据

### 3.1 物料检索与归因

检索先做 Unicode NFKC、空白与大小写规范化，支持编码、名称、别名和规格。编码精确匹配优先；名称/别名匹配结合规格和单位校验。存在多个候选时暂停并请求补充规格或物料标识，不能以“第一条记录”代替确定归因。外部候选重新执行匹配规则；详情必须与已选候选一致，格式正确但身份冲突的数据也会被拒绝。

Candidate 包含物料、匹配评分和命中原因。评分是检索规则分数，不是经过统计校准的模型置信概率。模型可在当前阶段选择额外的受控只读工具，并通过 record_attribution 提交证据解释与未校准置信值；物料身份、事实引用、数量和权限仍由规则校验。演示模式使用固定解释与工具序列，真实推理质量需单独评测。

MATERIAL 任务找到已存在物料时返回复用建议，不重复录入。找不到且提供完整 newMaterial 字段时，先验证任务约束，再独立按拟录入物料的编码、名称和别名查重，才生成新物料提案；字段缺失进入补证据流程。

### 3.2 重复采购与影响测算

可用库存只统计 AVAILABLE 状态的 quantity − reserved；FROZEN 与 SCRAPPED 不计入。已确认在途只统计 CONFIRMED 订单的 quantity − received；COMPLETED 和 CANCELLED 仅保留为历史证据。

存在可用库存或未完成采购时标记潜在重复风险，并返回原因、数量和历史采购标识。该判断表示需要业务复核，不代表所有新增采购都不合理。

- 建议采购量 = max(0, 需求量 + 安全库存 − 可用库存 − 已确认在途量)。
- 预计期末库存 = 可用库存 + 在途量 + 本次申请量 − 需求量。
- 缺口量 = max(0, 需求量 + 安全库存 − 可用库存 − 在途量 − 本次申请量)。
- 超额采购量 = max(0, 本次申请量 − 建议采购量)。
- 采购金额 = 采购量 × 单价，存储为最小货币单位；CNY 使用分。

需求量、安全库存和本次申请量必须提供；缺少时不生成完整测算结论。拒绝负数、非有限数、不安全的数值范围、错误状态、超额预留/收货以及金额溢出。单位与币种来自校验后的主数据。

### 3.3 证据与上下文

只读工具结果保存原始结构化数据，并分配 evidenceId、source 和 recordId。提案关联证据引用，审计事件关联参数摘要和结果摘要。数据源返回的文本被视为数据，不作为指令。

ContextPack 分为任务、证据引用、工具轨迹、当前状态和策略五层。模型上下文最多携带近期 32 个证据引用，事实摘要单条最多 1000 字符，总事实包按 24000 字符预算缩减；被截断的摘要明确标记，原始工具结果完整保存在 SQLite。历史工具轨迹压缩为摘要与近期记录；任务与权限策略不由普通摘要覆盖。

## 4. 状态机、审批与恢复

主链路为 RECEIVED → DISCOVERY → EVIDENCE_READY → ATTRIBUTION → DUPLICATE_CHECK → IMPACT_ESTIMATION → PROPOSAL_READY → POLICY_CHECK → WAITING_APPROVAL → EXECUTING → VERIFYING → COMPLETED。物料录入无需采购测算。

NEED_MORE_EVIDENCE 等待补充信息；FAILED 表示输入或控制校验未通过；RECOVERABLE 保存可重试阶段。每次状态迁移在同一事务内写入 checkpoint 和状态事件；创建审批与 WAITING_APPROVAL 的会话绑定也在同一事务内保存。状态转换有明确允许边界，不能从查询阶段直接跳入执行。

| 风险级别 | 示例 | 控制 |
| --- | --- | --- |
| L0 | 搜索、详情、采购历史、库存 | 身份和阶段校验后读取 |
| L1 | 重复校验、影响测算 | 确定性规则及审计 |
| L2 | 创建物料/采购提案 | 证据完整、无歧义、规则通过 |
| L3 | 模拟 ERP 写入 | 必须批准当前版本提案 |

Bearer token 在服务端配置中映射 userId 和角色，HTTP 请求体不能指定身份。业务用户拥有自己的会话；REVIEWER 可读取审批关联内容和提交决策，不能替业务用户修改任务或启动写入。

审批绑定 sessionId、工具名、proposalId、版本、argsHash 和 idempotencyKey。修改任务生成新提案版本并使旧审批失效；拒绝保留提案与原因，同版本不得自动重新执行。审批接口只提交决策，需要后续调用 resume 推进执行。

执行租约防止同一会话并发运行，checkpoint 使用乐观版本检查。幂等键对应唯一参数摘要：同键同参复用结果，同键异参返回冲突。模拟 ERP 写入及其幂等结果在同一事务内保存；恢复时先查 ERP 记录，再决定是否执行，最后核验批准的 payload 与实际结果。已经提交的匹配结果可在模型不可用时直接完成恢复与验证。

读取工具最多尝试三次。写入不进行盲目重试；出现不确定结果时进入 RECOVERABLE，恢复依赖幂等查询。进程异常退出后，残留租约最多等待 120 秒过期；正常结束会立即释放。

## 5. 接口与工具协议

| 接口 | 用途 |
| --- | --- |
| POST /sessions | 提交 task 并创建会话 |
| POST /sessions/:id/run | 推进到完成、等待审批、补证据或错误状态 |
| POST /sessions/:id/resume | 从持久化状态继续 |
| GET /sessions/:id | 会话状态及结果 |
| POST /sessions/:id/evidence | 提交 patch 补充或修订任务 |
| GET /sessions/:id/evidence | 原始证据及来源 |
| GET /sessions/:id/events | 模型、工具、策略和状态事件 |
| GET /sessions/:id/proposal | 当前提案 |
| GET /approvals | 审批者查询待审批事项 |
| POST /approvals/:id/decision | APPROVED 或 REJECTED 与原因 |
| GET /openapi.json | OpenAPI 描述 |
| GET /health | 服务与运行模式 |

业务工具包括 search_material、get_material_detail、get_purchase_history、get_inventory、check_duplicate、estimate_purchase_impact、create_material_proposal、create_purchase_proposal、execute_approved_action。另有内部 record_attribution，用于接收模型归因解释并校验证据引用。

ToolCall 使用 requestId、sessionId、toolName、args 和可选 idempotencyKey。风险取自注册表。ToolResult 返回 ok、data、evidenceRefs、errorCode 和 latencyMs；错误不会伪装成成功证据。

MCP stdio 服务公开四个只读数据工具，客户端通过工具发现和参数校验接入。CLI 数据适配器使用配置中的固定 command/args，通过 stdin 接收 JSON、stdout 返回 JSON；不启用 shell，并设超时和输出大小限制。审批与写入始终留在受控应用服务内。

## 6. 本地运行与配置

### 6.1 安装、验证与演示

需要 Node.js 24 和 npm。无需 Docker、外部数据库或模型密钥即可运行离线演示。

```shell
npm ci --ignore-scripts
npm run typecheck
npm run build
npm test
npm run demo
npm run benchmark -- --output data/benchmark.json
```

复制 .env.example 为 .env 后运行 npm run dev 或 npm start；默认监听 http://127.0.0.1:3000。模板中的 token 为明确标记的本地演示身份，实际共享访问前应替换。不要提交 .env、数据库或运行日志。

```shell
npm run cli -- session create --task-file examples/purchase.json
npm run cli -- session run SESSION_ID
npm run cli -- session show SESSION_ID
npm run cli -- approval list
npm run cli -- approval decide APPROVAL_ID --decision APPROVED --reason confirmed
npm run cli -- session resume SESSION_ID
npm run cli -- events SESSION_ID
```

业务命令使用 MATERIAL_TOKEN=local-user-token。审批命令切换 MATERIAL_TOKEN=local-reviewer-token，恢复执行时再切回业务用户。补充信息示例：session supplement SESSION_ID --task '{"specification":"6204"}'。

### 6.2 配置说明

| 配置 | 含义 |
| --- | --- |
| MODEL_MODE | demo 或 live，默认 demo |
| MODEL_PROVIDER | openai、anthropic 或 compatible |
| MODEL_NAME / MODEL_API_KEY | live 模式必填 |
| MODEL_BASE_URL | compatible 的 API 基础地址 |
| DATABASE_PATH | SQLite 文件，默认 data/material-agent.db |
| AUTH_TOKENS | token 与身份/角色的 JSON 映射 |
| MATERIAL_TOKEN | CLI 当前身份的 token |
| HOST / PORT | 默认 127.0.0.1 / 3000 |
| DATA_ADAPTER | local、mcp 或 cli |
| DATA_COMMAND / DATA_ARGS | 信任的固定程序和 JSON 参数数组 |

MCP 使用 DATA_ADAPTER=mcp、DATA_COMMAND=node、DATA_ARGS=["dist/tools/mcp-server.js"]。CLI 读取适配使用 DATA_ADAPTER=cli 与 DATA_ARGS=["dist/tools/data-cli.js"]。先执行 npm run build；子进程读取同一模拟业务数据库。真实业务接入需要实现相同 DataSource 合约和返回 schema。

live 模式配置 provider、model 和 key 后执行 npm run test:live。未配置凭据时独立测试明确跳过；调用出错不会自动替换成模拟模型。OpenAI-compatible 模式使用兼容聊天 API。

## 7. 演示案例与评测

采购示例 BRG-6204：需求 20、安全库存 3、申请采购 15；可用库存 8、已确认在途 5。系统建议采购 10，申请量超额 5，预计期末库存 8。申请金额 18750 分，建议金额 12500 分。冻结 99 和报废 20 均不计入可用量，已完成采购 100 不计入在途。

流程先生成提案并停在 WAITING_APPROVAL，ERP 写入次数为 0；审批者批准后，由业务用户 resume，进入 COMPLETED 并核验一笔模拟采购单。重复 resume 不产生第二笔写入。

离线 Benchmark 使用十个固定合成场景：重复库存/采购、无库存采购、物料歧义、规格补充、数量缺失、高风险待审批、审批拒绝、重启与重复恢复、写后 checkpoint 中断且模型不可用、新物料录入。它用于工程行为回归，不代表真实企业数据或真实模型的效果。

| 指标 | 计算依据 |
| --- | --- |
| Material Retrieval Recall@5 | 标注物料进入候选 Top 5 的比例 |
| Attribution Accuracy | 所有要求归因的标注案例中身份一致的比例；缺失预测计为失败 |
| Duplicate Precision / Recall | 重复判断与案例标签的混淆计数 |
| Tool Selection Accuracy | 独立标注的成功工具序列逐位置匹配比例；遗漏、额外调用和顺序错误扣分 |
| Policy Violation Rate | 未经授权的实际写入与策略检查次数 |
| Recovery Success Rate | 重启和写后中断案例恢复成功且无重复写入的比例 |
| End-to-End Success Rate | 状态、业务结果和写入数量满足标签的比例 |

本地验收的 53 项测试全部通过，覆盖单元、集成、E2E、故障注入和 Benchmark；类型检查与构建通过。十个合成案例的检索、归因、重复识别、工具序列、恢复及端到端标签全部满足，未经授权的实际写入为 0。真实模型测试缺少凭据，独立测试跳过 1 项，真实推理效果未验证；兼容协议另以本地 SSE 响应验证 SDK 工具解析和 Chat Completions 请求格式。详细审查修复记录保留在执行记录中。

## 8. 维护与扩展

新增数据源应实现 DataSource，并在进入证据层前验证返回值；新增工具必须登记 schema、风险、允许状态和只读属性。新增写操作应具备结果查询和幂等合约，不能只依赖本地记录宣称跨系统恰好执行一次。

新增业务规则需同步添加独立推导的测试案例和 Benchmark 标签。Windows/Linux CI 执行类型检查、构建、测试、离线演示和 Benchmark，保存评测报告。

当前 SQLite 适合本地演示及单机工程验证；Node.js 24 的内置 SQLite 会产生实验性 API 提示。生产化需要真实 ERP 幂等合约、组织身份系统、审批制度、库存时效校验、数据库部署策略及真实数据评测。这些能力不作为当前已经实现的生产集成描述。
