# Execution ledger

Pre-flight: Task 1 domain types feed Task 2 tool schemas; Task 2 Application feeds Task 3 API/CLI/Benchmark; Task 3 verified behavior feeds Task 4 documentation. Shared types are centralized in src/domain/types.ts. No conflicts.

Execution: native in current empty project directory; no existing branch or files require isolation. User approved the complete plan and requested implementation, so no repeat approval gate.

Task 1: complete — domain tests RED (7 missing-behavior failures) → GREEN 14/14; TypeScript check passed; commit 9b7ca55.
Task 2: Ruling: MCP/CLI inventory output includes AVAILABLE/FROZEN/SCRAPPED rows; integration assertion changed from exact one-row array to containment — filtering belongs to business rules, per spec. Cost if wrong: inflated supply, covered by domain tests.

Task 2: complete — workflow/control/adapters tests RED missing modules → GREEN; full suite 39/39; typecheck/build passed; commit 874b25f. SQLite Node 24 experimental warning is an upstream runtime property.

Task 3: complete — API/Benchmark tests RED missing modules → GREEN; full suite 43/43; typecheck/build passed; demo and nine original benchmark cases passed; real model test skipped without credentials; commit 58ba151.

Final review: fresh read-only reviewer (gpt-6-astra) examined 632a55e..58ba151. Five Important findings accepted: semantic material binding, independent new-master duplicate checks, compatible protocol, model-free ERP reconciliation, honest benchmark denominators/labels. Reproduced failures then fixed with regression tests.
Final: fixed conflicting details/candidates — semantic binding tests RED→GREEN.
Final: fixed duplicate new master/constraint mismatch — material E2E tests RED→GREEN.
Final: fixed compatible model protocol — intercepted SSE/HTTP test RED→GREEN, no external requests.
Final: fixed recovery depending on model — write/checkpoint interruption plus unavailable model RED→GREEN.
Final: fixed benchmark missing-output/extra-tool scoring — independent expected labels, ten cases including uncertain-write recovery; missing predictions fail.
Final: plan gaps classified Important because required behavior: specification search, bounded evidence summaries, bounded model reasoning/read-tool selection, atomic approval binding, atomic state-event checkpoint. Implemented and verified, including SQLite trigger failure and approval-checkpoint injection tests.

Final: Ruling: confidence is uncalibrated, model rationales are advisory and cannot override identity/quantities/policy — no statistical calibration or business ground truth supplied. Cost if wrong: users may overinterpret a score; documented explicitly.
Final: Ruling: stable synthetic tool sequences are scored independently in offline Benchmark; live models can select additional permitted reads and generate attribution rationales — offline scores do not claim live-model quality. Cost if wrong: benchmark does not predict external model success; live tests remain separate.
Final: Ruling: production ERP, distributed deployment and actual provider quality remain outside this synthetic local deliverable; hard power-loss/disk-corruption and multiprocess stress are not certified by an in-memory injected failure. Cost if wrong: unsuitable claims of production reliability; documented as extension work.
Final: Ruling: approval expiry and organizational separation of duties are not invented without business requirements; token roles and exact version binding remain enforced. Cost if wrong: production policy would need additional rules.
Document rendering: canonical render_docx.py diagnosed missing LibreOffice on Windows runtime. Use installed Microsoft Word automation for PDF export and bundled Poppler for every-page PNG review; do not install or use desktop LibreOffice.
Final verification (2026-10-05): typecheck/build passed; 9 test files, 53 tests passed; demo WAITING_APPROVAL → COMPLETED with one ERP write; all ten labeled offline Benchmark cases passed, seven metrics satisfied and unauthorized writes zero. Independent live test skipped once because credentials were unavailable.
Document verification: Markdown generated Word source content; all eight rendered pages visually checked after removing an inherited title border. Chinese text, tables and code examples are readable with no clipping or overlap.
