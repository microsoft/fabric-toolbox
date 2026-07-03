# MicrosoftFabricMgmt — Two-API completeness & enrichment plan

Research complete (2026-07-01). Decisions locked with maintainer. Working order below.

## Known issues
- [x] 429 handling — VALIDATED: retry logic already existed (429/503/504 + Retry-After) but the backoff fallback threw an `OverflowException` (`[int](Get-Date).Ticks`) when no Retry-After header. Fixed: extracted tested `Get-FabricRetryDelay` (Private) with clamping (1..120s); helper tests 7/7 + retry behavior tests 2/2 (429→retry→success, exhaust-retries). Resolver caching confirmed present.
- [x] PS 5.1: DISCOVERED the module is PS7-only (manifest `CompatiblePSEditions=@('Core')`, `PowerShellVersion='7.0'`; won't import on 5.1) — contradicted CLAUDE.md's "MUST support 5.1". Maintainer decision: accept PS7-only; corrected CLAUDE.md + CHANGELOG (5.1 no longer claimed; PS7 syntax now permitted).
- [ ] Get-FabricSemanticModel doesn't pipe.
- [ ] Consider lazy/opt-out enrichment to reduce the eager name-resolution burst (the flip made this call-heavier); retry now absorbs 429s.

## Phase 0 — Tooling first (DONE)
- [x] Built Power BI spec cache in `Update-FabricAPISpecsCache.ps1` → `powerbi.swagger.json` + `powerbi-api-validation.json` (287 ops, 224 paths, OpenAPI 2.0 from PowerBI-CSharp).
- [x] Rewrote `Validate-FabricModuleCoverage.ps1` matcher: path-based (AST-extracts each function's URI + method, normalizes, matches vs swagger), dual-API via `-Api Fabric|PowerBI|All`.
- [x] Re-ran: Fabric 71.2% overall / 82.8% real item-resources (was bogus 56%); POST 27%→68%. PowerBI Admin 50/59, Gateways 4/11 (in-scope Admin+Gateways 54/70 = 77%).

### Real bugs the fixed validator surfaced
- [x] **FIXED:** `Add/Remove/Update-FabricConnectionRoleAssignment` built `/connections/roleAssignments/{id}` instead of `/connections/{id}/roleAssignments`. Root cause: `New-FabricAPIUri` appends `-Subresource` before `-ItemId`. Fix: added `-ResourceId` alias for the primary-id slot; fixed 3 call sites. Regression suite `tests/Unit/ApiUriRegression.Tests.ps1` (red→green verified; pins the helper ordering contract too).
- [x] **FALSE POSITIVE (sharing links DELETE-on-POST):** both `Remove-FabricSharingLinks` + `...Bulk` already POST correctly; the `Method='Delete'` was inside a CORRUPTED synopsis comment. Fixed the real defects instead: repaired garbled comment-based help, removed dead `$Items`/`$WorkspaceId` refs. Covered by the regression suite.
- [x] **BUG 3 — jobType: RESOLVED, NOT A BUG.** Verified against Microsoft Learn (2026-05 docs): the job-type-in-path form (`/jobs/tableMaintenance/instances`, `/jobs/sparkjob/instances`) is now preferred, but the query form (`?jobType=`) the module uses is *"still supported for backward compatibility."* Table-maintenance body shape (`executionData` wrapper) is correct. No fix needed.
      - OPTIONAL (deferred, low value): modernize `Start-FabricLakehouseTableMaintenance`, `Start-FabricLakehouseRefreshMaterializedLakeView`, `Start-FabricSparkJobDefinitionOnDemand` to the path-segment form to clear the validator's cosmetic flag.
- Genuine Fabric gaps (no functions): `platform` meta-group 32/118 — git integration, deployment pipelines, networking, job scheduler, tags. Plus mlModel scoring, warehouse restore points/sqlAudit, lakehouse materialized-view schedules, apacheAirflowJob files/pool-templates.
- Genuine PowerBI Admin gap: org-wide `GET /admin/capacities/refreshables` (our Get-FabricAdminRefreshable forces CapacityId).

## Phase 1 — -Raw flip + completeness harness
- [x] Flipped `Private/Select-FabricResource.ps1`: default = full object + resolved-name NoteProperties (Workspace + cascaded Capacity) + PSTypeName; `-Raw` = untouched API response. Help updated.
- [x] Fixed `Get-FabricWorkspaceRoleAssignment`: now preserves the full nested `principal` object (was trimmed), default enriches (names + flattened display fields + type), `-Raw` returns untouched.
- [x] Smoke tests `tests/Unit/EnrichmentFlip.Tests.ps1` (4/4 green: default enriched, -Raw untouched, nested principal preserved).
- [x] Verified no regressions: my new tests pass; full-suite red is PRE-EXISTING only — (a) ~12 stale param tests (functions gained `-Raw`, expected-lists not synced; fix via `scripts/sync-test-expected-params.ps1`), (b) Resolve* tests fail only in full-folder runs ("Multiple modules loaded" cross-file contamination) but pass 18/0 in isolation.
- [x] Greened the pre-existing stale param tests via `sync-test-expected-params.ps1` (251 files updated, mostly adding the missing `-Raw`; previously-failing param tests now pass).
- [x] Property-completeness harness: `tests/Unit/PropertyCompleteness.Tests.ps1` + `scripts/Get-FabricSchemaProperty.ps1` (schema round-trip with allOf/cross-file $ref resolution; negative control proves detection; 25/0). Added `common` definitions to the cache (real `Item` base) so resolution doesn't rely on hardcoded fallbacks.
- [x] Documented the `-Raw`/enrichment flip in CHANGELOG.
- [ ] `.ps1xml` render check post-flip (format ScriptBlocks resolve at display time; NoteProps additive — low risk; confirm visually when a live session is available).
- [ ] PERF/429: default now resolves names EAGERLY on every Get-* (cached). Increases API calls when piping without display; reinforces the 429/backoff todo — consider a lazy/opt-out enrichment switch.
- [ ] Extend the completeness harness coverage table beyond the starter set (8 fns) to more functions incrementally.
- [ ] Version bump handled by the Sampler/GitVersion build (not manual).

## Phase 2 — Enrichment / -Raw / type backfill (module-wide) — DONE
- [x] `-Raw` coverage now **100% (167/167)** — backfilled ~72 functions (definitions, connection strings, tenant/settings, LRO, sub-resources, admin) via 3 parallel agents + 1 straggler (`Get-FabricUserListAccessEntities`). All parse-clean; build clean.
- [x] Enrichment + type added to sub-resource getters carrying resolvable ids (Environment/Eventstream/Livy/Lakehouse/MirroredDB-status/OneLake/Warehouse) and admin getters (AdminDataflowUpstream/DatasetDataflowLink/ItemUser/WorkspaceUnusedArtifact/WorkspaceUser→WorkspaceName; AdminCapacityUser→CapacityName; AdminDatasetUser→DatasetName; WorkspaceAsAdmin→CapacityName). Type-only: AdminDataset, AdminWorkspaceScanStatus. Scalar/connection/policy endpoints kept as `-Raw` passthrough (no forced enrichment).
- [x] Re-synced param tests; verified build module (1.0.8) has `-Raw` on all (forced-import check). My 5 test suites 46/46.

### TOOLING FOOTGUN (flag to maintainer)
- `scripts/sync-test-expected-params.ps1` **corrupts test files when run a SECOND time** without first restoring: its fallback path duplicates the `$expectedParams = @(...)` block and breaks the `param()` structure, causing Pester **discovery failures** across ~200 files. A single run from a clean (HEAD) state is safe (verified: 264 files, 0 parse errors). Recovery used: `git checkout -- tests/Unit` then run sync ONCE. The script needs an idempotency fix (remove existing block(s) before inserting exactly one) — not yet done.

### ENV GOTCHA (flag to maintainer)
- A stale **1.0.9** copy installed at `E:\OneDrive\Documents\PowerShell\Modules\MicrosoftFabricMgmt\1.0.9` SHADOWS the dev build (`output/module/.../1.0.8`) during PowerShell auto-import. Ad-hoc `Invoke-Pester` (param tests without explicit import) resolves the stale 1.0.9 and reports `-Raw` missing — a FALSE failure. `.\build.ps1 -Tasks test` is authoritative (puts output/module first on PSModulePath). Fix: bump build version past 1.0.9 or remove the stale installed copy.

### Verification (Phase 2)
- Build clean; `-Raw` 100% (167/167); my 5 test suites 46/46.
- Fixed my own incremental analyzer debt from the backfill: 45 `PSReviewUnusedParameter` (added `if ($Raw){return ...}` early-return to the passthrough functions) + 3 missing UTF-8 BOMs.
- Remaining analyzer findings on changed files (56) are ALL pre-existing rule types (51 `PSUseProcessBlockForPipelineCommand` on ValueFromPipeline funcs lacking `process{}`, 4 `PSUseOutputTypeCorrectly`, 1 `ShouldProcess`) — not introduced by the `-Raw`/enrichment edits.
- Pre-existing QA-suite debt (module-wide, NOT mine): ~66 "Author for functions" (funcs lacking an `Author:` line) + many "Should have a unit test for X" / "Should pass Script Analyzer for X" across untouched functions; build exits 0 (non-blocking). Recovered from the sync-double-run discovery corruption (see footgun above).

### Follow-ups (new type names need format views)
- New `MicrosoftFabric.*` type names added (LivySession, EnvironmentSparkCompute, EventstreamSource, LakehouseTable, MirroredDatabaseStatus, OneLakeShortcut, WarehouseSnapshot, AdminDataset, etc.) have NO `.ps1xml` views yet → they display default/list formatting. Add table views incrementally (formatting backfill).
- Extend `PropertyCompleteness.Tests.ps1` coverage table to a few newly-enriched functions.

## QA debt (DONE) — decisions: fix code (not suppress), author="Tiago Balabuch, Jess Pomfret, Rob Sewell", meaningful tests for ALL test-less functions
Baseline QA-gate failures: 323 → **FINAL: `build,test` GREEN — 7979 passed / 0 failed, Build succeeded (15 tasks, 0 errors)**. ScriptAnalyzer/Author/missing-test gates all cleared; fixed the Clear-FabricNameCache cross-test cache-pollution flake.
Commits: e1bfa5c (enrich/-Raw/tooling), 72ae570 (analyzer/authors/process-blocks), 4c6d4d9 (Get-* tests + -Segments fix), 3291e6b (non-Get-* tests), b3c0a1f (Clear-FabricNameCache flake fix).
- [x] **ScriptAnalyzer (88 → 0 on source/Public):** fixed 78 `PSUseProcessBlockForPipelineCommand` by wrapping bodies in `process{}` (REAL fix — pipeline funcs now process every piped item, not just the last), via 3 agents (verified parse-clean + rule-cleared). Fixed the remainder: OutputType attrs (Resolve-*/Export), empty catch (OneLakeDataAccessRole), unused param (Set-FabricApiHeaders), 2 BOMs, trailing ws (Get-FabricDomain). Suppressed a false-positive ShouldProcess on the private New-FabricAPIUri (pure URI builder). Analyzer now 0 on source/Public AND source/Private.
- [x] **Author (66 → 0):** added "Author: Tiago Balabuch, Jess Pomfret, Rob Sewell" to the .NOTES of the 66 files lacking one (newer resource families + Resolve-* helpers), encoding preserved, parse-clean.
- [x] **Meaningful tests for all 80 test-less Get-*** (decision: meaningful, not stubs). Canonical `Get-FabricAdminDataset.Tests.ps1` + 79 via 4 agent batches (~263 test cases, all green). Each asserts exact endpoint + method + enrichment/type (or passthrough for definitions/scalars) + `-Raw` untouched.
- [x] Orphans: deleted plural `Get-FabricExternalDataShares.Tests.ps1`; `Clear-FabricNameCache` failure is full-run contamination only (passes 10/0 isolated).
- [x] **2nd major bug found + fixed via the test pass:** `New-FabricAPIUri -Segments` didn't exist → 34 functions (all `*Definition` get/update built via segments + Domain functions) silently no-op'd. Added `-Segments` parameter set. Verified a definition getter now POSTs the correct `.../getDefinition` URL.
- [x] **Meaningful tests for all 85 NON-Get-* test-less functions** (16 New, 20 Remove, 33 Update, 5 Start, Stop, Set, 3 Add, Export, Invoke, Restore + 3 Resolve helpers). State-changing funcs assert endpoint+method with `-Confirm:$false` and a `-WhatIf`-makes-no-call test; Resolve-* use the cache/fallback pattern. All green via 4 agent batches. => ALL 165 test-less functions now covered.

## Phase 3 — New commands (IN PROGRESS; property-completeness precondition confirmed)
Building missing High-priority commands, each with full-property return + enrichment + -Raw + type + meaningful tests + analyzer-clean.
- [x] **Connections create/update**: `New-FabricConnection` (POST /connections), `Update-FabricConnection` (PATCH /connections/{id}). Polymorphic body via -ConnectionDetails/-CredentialDetails hashtables; GatewayName enrichment; tests 11/11; analyzer 0.
- [x] **Job Scheduler (7 commands)**: New/Get/Update/Remove-FabricItemSchedule, Start-FabricItemJob, Get-FabricItemJobInstance, Stop-FabricItemJobInstance. `{jobType}` paths via `-Segments`. Tests 27/27; analyzer 0. Also fixed a `New-FabricAPIUri` binding bug (mandatory `[string[]]$Segments` rejected a null trailing element → the two getters built the segment list conditionally instead).
- [x] **Git integration (8 commands)**: Connect/Disconnect-FabricWorkspaceGit, Initialize-FabricWorkspaceGitConnection, Save-FabricWorkspaceGitCommit, Update-FabricWorkspaceFromGit, Get-FabricWorkspaceGitStatus, Get/Update-FabricWorkspaceGitCredential. (Get-FabricWorkspaceGitConnection already existed.) Tests 32/32; analyzer 0.
- [x] **Deployment Pipelines (14 commands)**: pipeline CRUD, stages (get/update/items), assign/unassign workspace, Invoke-FabricDeploymentPipelineDeploy, operations, role assignments (get/add/remove). Tests 55/55; analyzer 0. Flags: spec marks `stages` (create) and `targetStageId` (deploy) as required but implemented optional (API surfaces the error if omitted) — revisit if strictness wanted. PrincipalType ValidateSet mirrors Add-FabricConnectionRoleAssignment (common Principal enum not cache-resolvable).
- [x] **Medium gaps (19 commands)**: DataPipeline definition (2), Warehouse restore points (5), ML Model endpoint (8, incl. scoring + version activate/deactivate), External Data Share create/delete/invitation/accept (4). Tests 71/71; analyzer 0.
- [x] **Workspace networking + immutability + org-wide refreshables (9 commands, 1 modified)**: 8 networking commands under `/workspaces/{id}/networking/communicationPolicy/...` — `Get/Set-FabricWorkspaceNetworkCommunicationPolicy` (PUT `-IfMatch`), `Get/Set-FabricWorkspaceOutboundConnectionRule`, `Get/Set-FabricWorkspaceOutboundGatewayRule`, `Get/Set-FabricWorkspaceGitOutboundPolicy` (PUT `-IfMatch`); plus `Set-FabricOneLakeImmutabilityPolicy` (POST modifyImmutabilityPolicy). Modified `Get-FabricAdminRefreshable`: `-CapacityId` now optional → org-wide `/admin/capacities/refreshables` ($top defaulted 1000) + new `-Expand`. Body schemas external (workspaceNetworkingPolicy.json) so networking setters use hashtable pass-through. Networking bodies GET enrich WorkspaceName+type. Full build,test GREEN 8626/0/1-skip; analyzer 0 on new files. Managed Private Endpoints were already covered (Get/New/Remove) — no work needed.
Remaining verified gaps: none material. `platform` meta-bucket otherwise covered; SQL DB start/stop mirroring already exist. Cosmetic-only leftover: modernize 3 `Start-Fabric*` job funcs to the path-segment jobType form (validator flag only), and lower-value/preview resource families (ontology, digitalTwinBuilder, anomalyDetector, graphModel, dataflow job scheduling) if desired.
Note: create/accept bodies for External Data Share and some ML endpoint update fields use hashtable passthrough (exact schemas in externaldatasharing.json not cache-resolvable) — tighten by adding those nested definitions to the cache updater.
Note: fetched platform/definitions/connections.json into the (gitignored) cache for schema — add it to Update-FabricAPISpecsCache.ps1 for durable validation of connection bodies.
Medium: ML Model scoring, SQL DB start/stop mirroring, Warehouse restore points, External Data Share provider/accept, DataPipeline definition pair, dataflow job scheduling, workspace outbound/network policies.

## Notes
- Reference implementation for new pattern: `source/Public/Admin/Get-FabricAdminDatasetDatasource.ps1`.
- Resolvers exist: Workspace, Capacity, CapacityIdFromWorkspace, Dataset, Gateway. No new resolvers needed.
- 7 `Get-FabricAdmin*` functions hit the Fabric API, not Power BI — split is by base URL, not name.
