# Atlas MCP: read-only evidence interface

**Status (2 October 2026):** implemented and tested locally, disabled by
default, not deployed. Live use is blocked by the deployment and identity
gates in [section 7](#7-gates). Workstream L of issue #42.

Atlas MCP is a local [Model Context Protocol](https://modelcontextprotocol.io/)
server that answers governance questions from Atlas's **last validated
snapshot**. Every answer states which snapshot it came from, when that snapshot
was synchronized, which sources contributed, how complete the evidence is and
what it cannot prove. It never changes Fabric, Atlas data, permissions or
deployments, offers no remediation and has no chat or business-data tool.

## 1. Verified comparison with Microsoft MCP servers

Checked against Microsoft Learn on 2 October 2026. Page dates are the
published `ms.date` values.

| Server | Hosting and endpoint | Identity | Writes | Relevance to Atlas |
| --- | --- | --- | --- | --- |
| Fabric Core MCP Server | Remote, `https://api.fabric.microsoft.com/v1/mcp/core` | OAuth 2.0 with Entra ID, scope `https://api.fabric.microsoft.com/.default`; uses the caller's Fabric RBAC | **Yes, including destructive tools** | Live resource management. No snapshots, history, provenance or coverage. |
| Fabric IQ MCP | Remote, `https://fabriciq.svc.cloud.microsoft/v1/mcp/fabriciq` | Delegated OAuth only: `Item.Read.All`, `Item.Execute.All`, `Dataset.Read.All` | No | Power BI reports and semantic models, including DAX query results. No ontologies or data agents. |
| Ontology MCP server | Remote, one endpoint per ontology item | Delegated; service principals blocked by a known issue | Not documented (Preview) | Business entities and relationships of one ontology, not cross-item governance. |
| Data agent MCP server | Remote, one endpoint per published agent | Fabric bearer token | No | One natural-language answering tool grounded in the agent's data. |
| Fabric MCP Server (local) | Local subprocess, open source | Configured credentials for live operations | Yes (item creation, OneLake file writes, Data Factory operations) | Developer tooling and live operations, not governance evidence. |

### Fabric Core MCP exposes destructive CRUD

The tools reference ([ms.date 2026-09-15][core-tools]) lists 29 tools. Fourteen
read: `search_catalog`, `list_workspaces`, `get_workspace`,
`list_workspace_roles`, `get_workspace_role`, `list_items`, `get_item`,
`get_item_definition`, `list_folders`, `get_folder`, `list_capacities`,
`get_operation_state`, `get_operation_result` and `get_knowledge`. Fifteen
change state: `create_workspace`, `update_workspace`, `delete_workspace`,
`add_workspace_role`, `update_workspace_role`, `delete_workspace_role`,
`create_item`, `update_item`, `delete_item`, `update_item_definition`,
`bulk_move_items`, `create_folder`, `update_folder`, `delete_folder` and
`move_folder`. Microsoft notes that deleting a workspace permanently removes
its items.

The overview ([ms.date 2026-09-15][core-overview]) warns: *"Autonomous or
misconfigured clients may perform destructive actions."* It adds that flags to
prevent destructive operations *"aren't standardized in the MCP specification
and might not be supported by all clients."* Neither page states a Preview or
GA maturity. Core MCP is therefore not a read-only substitute: a read-only
deployment depends on client-side tool filtering that Microsoft does not
guarantee.

### Fabric IQ MCP is delegated-only and excludes ontologies and data agents

The Fabric IQ MCP page ([ms.date 2026-09-14][iq-mcp]) states that the server
is generally available and read-only. It requires delegated `Item.Read.All`,
`Item.Execute.All` and `Dataset.Read.All`, and *"Service-principal and
application-only authentication aren't supported."* It *"doesn't currently
support Fabric ontologies or data agents,"* nor dashboards, paginated reports
or Power BI apps. Its documented tools are `DiscoverArtifacts`,
`ResolveFabricItem`, `GetReportMetadata`, `GetSemanticModelSchema`,
`ValueSearch` and `ExecuteQuery`; `ExecuteQuery` returns semantic model rows
(250 by default). The tool contract version is selected with
`X-Variants: Fabric.Routing.FabricIQ.V1`.

A runtime `tools/list` observed through an existing GitHub Copilot CLI
connection on 2 October 2026 listed `ResolveReportIdFromUrl` instead of
`ResolveFabricItem`, and its `DiscoverArtifacts` description says data agents
are not supported. Microsoft documents the runtime list as authoritative, so
Atlas does not hard-code the IQ tool set.

The Ontology MCP server ([ms.date 2026-04-14][ontology-mcp]) is Preview, uses
one endpoint per ontology item and cannot currently be used by service
principals. The data agent MCP server ([ms.date 2026-09-03][agent-mcp]) exposes
one question-answering tool per published agent. Issue #42 forbids querying
data agents for business answers, so Atlas uses neither.

The [server directory][directory] (ms.date 2026-09-15) states that local
servers *"can still connect to live Fabric resources."* This corrects the
research note that the local Fabric MCP server never touches a live tenant.

### What Atlas adds

| Atlas tool | Question it answers | Closest Microsoft tool | Atlas-only value |
| --- | --- | --- | --- |
| `atlas_get_snapshot_changes` | What changed between the last two validated snapshots? | None | Historical comparison of items, schema, grants, sensitivity, lineage and jobs |
| `atlas_get_snapshot_provenance` | How fresh and complete is this evidence? | None | Snapshot ID, sync time, per-section collection status, sync audit |
| `atlas_get_known_impact` | What is upstream or downstream of this item? | None; Core MCP has no lineage tool | Hop distances over collected lineage with the edges used |
| `atlas_explain_lineage_evidence` | Which sources support this relationship? | None | Authoritative lineage beside non-authoritative Item Relations (Beta) evidence, with agreement status |
| `atlas_get_access_evidence` | Which grants are recorded, and which access layers are unknown? | Core `list_workspace_roles` (live roles only) | Grant sources, flags and explicit unknown or unsupported layers |
| `atlas_get_operational_incidents` | Which items currently fail, and what may be affected? | None | Observed failures kept separate from inferred downstream impact |
| `atlas_find_catalog_items` | Where is this item, table, column, measure, ontology entity or data agent source? | Core `search_catalog`, IQ `DiscoverArtifacts` | Includes ontology and data agent definition metadata that IQ MCP excludes; no definitions, expressions or data |
| `atlas_list_workspaces` | Which workspaces may Atlas MCP read? | Core `list_workspaces` | Only the administrator-selected Atlas scope |

Atlas MCP does not duplicate live resource management, role changes, DAX
queries, data answers or OneLake file access. Use the Microsoft servers for
those, with their own permissions and safeguards.

## 2. Tool contract

Contract `fabric-atlas-mcp` version 1 lives in `src/atlas/mcp/`. Every tool is
annotated `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true` and `openWorldHint: false`. Input schemas reject unknown
properties. All limits are fixed in `ATLAS_MCP_LIMITS`.

| Tool | Inputs | Result |
| --- | --- | --- |
| `atlas_list_workspaces` | none | Selected workspaces, whether each is administrator-selected or the configured fallback |
| `atlas_get_snapshot_provenance` | `workspaceId?` | Counts, section status (up to 40) and the 10 most recent sync audit rows |
| `atlas_find_catalog_items` | `workspaceId?`, `query` (1–200), `kinds?`, `itemTypes?` (≤10), `limit` (≤25) | Item and object matches with metadata availability flags |
| `atlas_get_known_impact` | `workspaceId?`, `itemId`, `direction`, `maxDepth` (≤6), `limit` (≤100) | Upstream and downstream items with distances, path edges (≤200) and unbounded reach counts |
| `atlas_explain_lineage_evidence` | `workspaceId?`, `itemId`, `limit` (≤50) | Relationships touching the item, by source and agreement |
| `atlas_get_access_evidence` | `workspaceId?`, `itemId?`, `limit` (≤50) | Item: recorded grant paths (≤20) per principal, named by display name and object ID; an unresolved grant shows its recorded reference. Workspace: counts only. Always the six evidence layers |
| `atlas_get_operational_incidents` | `workspaceId?`, `includeImpact`, `limit` (≤25) | Observed incidents, inferred impact (≤25 per incident) and monitoring-source status |
| `atlas_get_snapshot_changes` | `workspaceId?`, `domains?`, `limit` (≤100) | Changes between the two most recent validated snapshots |

Every result uses the same envelope:

```json
{
  "contract": "fabric-atlas-mcp",
  "contractVersion": 1,
  "tool": "atlas_get_known_impact",
  "readOnly": true,
  "workspace": { "workspaceId": "…", "displayName": "…" },
  "snapshot": { "snapshotId": "…", "syncedAt": "…", "deploymentId": "…", "validation": "manifest-verified" },
  "retrievedAt": "…",
  "sources": [{ "id": "atlas-snapshot", "label": "Validated Atlas snapshot", "authority": "authoritative", "observedAt": "…" }],
  "coverage": { "status": "complete", "returned": 4, "total": 4, "truncated": false, "notes": [] },
  "limitations": ["Evidence comes from the last validated Atlas snapshot, not live Fabric state.", "…"],
  "result": {}
}
```

`authority` distinguishes authoritative snapshot evidence, non-authoritative
Beta evidence, derived inferences, configuration and audit records. Coverage
is `complete`, `partial`, `unavailable` or `not-applicable`; access evidence is
never `complete` because restriction layers are not collected.

Failures return the same envelope with `result: null` and an explicit error:
`invalid-arguments`, `unauthenticated`, `authentication-pending`,
`scope-unavailable`, `workspace-required`, `workspace-not-in-scope`,
`snapshot-unavailable`, `item-not-found`, `history-unavailable`,
`result-too-large` or `internal-error`. Messages never contain tokens, raw
payloads or stack traces. MCP clients receive them as tool errors
(`isError: true`). Unknown tools, such as `delete_item`, are rejected as
JSON-RPC invalid parameters. Only `initialize`, `ping`, `tools/list` and
`tools/call` are served; resources, prompts, sampling, completions and logging
are refused. Protocol revisions `2025-11-25`, `2025-06-18`, `2025-03-26` and
`2024-11-05` are negotiated; `structuredContent` and `outputSchema` are only
sent from `2025-06-18`.

### Evidence reuse

The tools call the same functions as the Atlas UI:

| Tool | Existing functions |
| --- | --- |
| Catalog lookup | `buildSearchIndex` and `searchIndex` (`search.ts`), restricted to items, tables, views, columns and measures |
| Known impact | `getItemImpactReport`, `createLineageIndex` and `getLineageImpact` (`lineage.ts`) |
| Lineage evidence | `buildLineageEvidence` (`lineage-evidence.ts`) and `parseItemRelationsEvidence` |
| Access evidence | `buildAccessReviewRows`, `selectAccessByItem`, `summarizeAccessReview` (`governance.ts`) and `buildAccessEvidenceCoverage` (`access-coverage.ts`) |
| Incidents | `observedIncidents`, `incidentImpact` and `MONITORING_SOURCES` (`observability.ts`) |
| Changes and provenance | `compareSnapshots`, `summarizeSnapshot` and `snapshotFromData` (`history.ts`) |

Snapshots come from `loadFromDb`, history from `loadHistoryFromDb`, scope from
`loadWorkspaceScopes` and Beta evidence from
`readLatestItemRelationsEvidence`. Trusted-writer manifests, count
verification and Item Relations checksums therefore apply unchanged. Item
Relations evidence is read only when the `item-relations` flag is enabled,
matching Map & lineage.

## 3. Authorization, scope and disclosure

- **App audience.** The server signs in through Rayfin's documented direct
  Entra exchange (`signInWithEntraToken`). The user's delegated token must
  carry `Item.Execute.All` for the Power BI audience, and Fabric requires
  Execute permission on the Atlas app item, which is the deployed app
  audience. Reads then run as that user under the existing
  `@authenticated('read')` entity policies. Every tool call checks the
  session before reading scope or evidence, and the session check is never
  cached.
- **Workspace scope.** Only workspaces in `WorkspaceScope`, or the configured
  deployment workspace when no scope is persisted, are read. Other workspace
  IDs are refused. With several selected workspaces, `workspaceId` is
  required.
- **Personal state.** Saved views, review decisions, review history and Radar
  acknowledgements are never read. Team notes, configuration values, principal
  emails and job messages are not searchable through MCP. Snapshot changes
  withhold email-like values and job messages and list only field names for
  schema objects.
- **Read-only.** The data source exposes load operations only. The server
  calls only Microsoft Entra ID for sign-in and the Atlas Rayfin backend for
  the token exchange, session refresh and Data API reads. It invokes no Rayfin
  Function and no Fabric REST or Power BI API, and writes nothing.
- **Disclosure boundary.** Responses contain metadata already shared with the
  authenticated app audience. They leave Atlas into the MCP client and model,
  so that client's data-handling terms apply, as Microsoft notes for its own
  MCP servers.
- **Local transport.** The server speaks stdio only and opens no network
  listener. stdout carries MCP messages; logs go to stderr. Tokens stay in the
  in-memory MSAL cache and are never written or logged.

### Design decision: local stdio, not a Rayfin Function endpoint

Rayfin Functions return a Fabric invocation envelope, not MCP JSON-RPC, and
the AppBackend does not publish the OAuth metadata MCP clients use to sign in.
A Function would also duplicate the browser's snapshot validation in a second
code base. Reading the Rayfin database does not need the owner-bound
application identity that Functions use for external connections. The stdio
server reuses the validated loaders and leaves every database check to Rayfin.
Revisit this choice if Rayfin adds MCP hosting.

## 4. Configuration

All switches default to off:

| Setting | Default | Purpose |
| --- | --- | --- |
| `services.auth.fabric.externalEntraExchange` in `rayfin/rayfin.yml` | `false` | Platform switch that lets delegated tokens be exchanged for Rayfin sessions |
| `ATLAS_MCP_ENABLED` | unset (disabled) | The server exits with code 78 unless this is `true` |
| `ATLAS_MCP_CLIENT_ID` | none | Public client registration (no secret) |
| `ATLAS_MCP_TENANT_ID` | build-time Atlas tenant | Tenant that owns the Atlas app item; multi-tenant authorities are refused |

The Rayfin backend URL, publishable key, trusted synchronizer email and
feature flags come from the same build-time `VITE_*` values as the SPA.

## 5. Running it after the gates

1. Review the exchange switch, set `externalEntraExchange: true`, and run a
   full `npx rayfin up`. Enabling the exchange lets any delegated-token holder
   with Execute permission on the item obtain a Rayfin session.
2. Register a single-tenant public client. Turn on public client flows and add
   the delegated Power BI Service permission `Item.Execute.All`. Conditional
   Access must allow the device code flow.
3. Run `npm run build:mcp` to build `dist-mcp/atlas-mcp.mjs`.
4. Add the server to your MCP client, for example in `.vscode/mcp.json`:

   ```json
   {
     "servers": {
       "fabric-atlas": {
         "type": "stdio",
         "command": "node",
         "args": ["${workspaceFolder}/dist-mcp/atlas-mcp.mjs"],
         "env": {
           "ATLAS_MCP_ENABLED": "true",
           "ATLAS_MCP_CLIENT_ID": "<public-client-id>",
           "ATLAS_MCP_TENANT_ID": "<tenant-id>"
         }
       }
     }
   }
   ```

5. Complete the device sign-in printed in the server log, then call
   `atlas_list_workspaces`. Calls made while sign-in is pending return
   `authentication-pending`.

Azure CLI tokens cannot be used. On 2 October 2026,
`az account get-access-token --scope https://analysis.windows.net/powerbi/api/Item.Execute.All`
was refused with a declined-scope error, and the CLI's Power BI token carried a
single scope without `Item.Execute.All`.

## 6. Validation

`src/atlas/mcp/*.spec.ts` and `src/mcp/*.spec.ts` cover the envelope for every
tool, fail-closed authentication, scope refusal, strict arguments, the evidence
results, Beta evidence handling, withheld values, protocol negotiation, refused
methods and tools, size limits, stdio framing and the sign-in state machine.
`npm run build:mcp` produces a Node bundle. Local startup checks confirmed
that the server is disabled by default, refuses a missing client ID and stops
before sign-in when no Rayfin backend is configured. A bundle built with
placeholder backend values answered `initialize` and `tools/list` over stdio,
refused `resources/list` and `delete_item`, and returned an `unauthenticated`
tool error when Entra sign-in failed.

## 7. Gates

- [x] Proposed operations compared with Fabric Core and Fabric IQ MCP.
- [x] Fabric Core MCP documented as destructive CRUD, not a read-only substitute.
- [x] Fabric IQ MCP documented as delegated-only, without ontologies or data agents.
- [x] Read-only operations defined and implemented.
- [x] App audience and workspace scope enforced, fail closed.
- [x] Snapshot, timestamp, provenance, coverage and limitations in every response.
- [x] Existing deterministic evidence functions reused.
- [x] Remediation, permission changes, mutations and generic chat excluded.
- [ ] **Deployment gate:** `externalEntraExchange` is not enabled or deployed,
  and the direct exchange is unverified in the target Fabric environment.
- [ ] **Identity gate:** no public client registration or `Item.Execute.All`
  consent exists yet; device code flow must be allowed by Conditional Access.
- [ ] **Live validation:** end-to-end sign-in, latency and payload sizes against
  a deployed snapshot.

[core-tools]: https://learn.microsoft.com/en-us/rest/api/fabric/articles/mcp-servers/core-remote/tools-core-mcp-server
[core-overview]: https://learn.microsoft.com/en-us/rest/api/fabric/articles/mcp-servers/core-remote/overview-core-mcp-server
[iq-mcp]: https://learn.microsoft.com/en-us/fabric/iq/connectors/fabric-iq-mcp
[ontology-mcp]: https://learn.microsoft.com/en-us/fabric/iq/ontology/how-to-use-ontology-mcp-server
[agent-mcp]: https://learn.microsoft.com/en-us/fabric/data-science/data-agent-mcp-server
[directory]: https://learn.microsoft.com/en-us/rest/api/fabric/articles/mcp-servers/fabric-mcp-servers-list

Other sources: [Fabric MCP servers overview](https://learn.microsoft.com/en-us/rest/api/fabric/articles/mcp-servers/what-is-fabric-mcp-server)
(ms.date 2026-09-17) and the Rayfin 1.36.2 guide
`node_modules/@microsoft/rayfin-guide/assets/docs/auth/direct-entra-auth.md`.
