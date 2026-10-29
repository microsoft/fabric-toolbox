# Power BI metadata replacement

Contract and identity review: **2026-10-02, Rayfin 1.36.2**.

`workspaceCollectPowerBi` is a deployed-compatible, read-only Functions tranche.
It replaces supported scanner metadata reads through public Fabric REST APIs,
not through a forwarded browser credential. It is not a complete scanner
replacement, does not publish snapshots, and does not change the active Python
UDF synchronization flow.

The optional, disabled-by-default `workspaceCollectPowerBiScanner` now provides
an additional public service-principal identity path through Rayfin 1.36.2
Secret Store. It requires explicit credential/scope provisioning and tenant
approval, creates no credentials, and never forwards browser tokens. See
[powerbi-scanner-secret-store.md](powerbi-scanner-secret-store.md) for the
installed contract proof, exact six secret names and tenant settings.

## Supported identity boundary

The registered handler declares `RayfinContext<AtlasSchema, AudienceType.Fabric>`
and reads only `ctx.Tokens.Fabric`, after the caller passes the policy-protected
`SynchronizerAuthority` gate. Rayfin DB authorization remains caller-scoped.
The installed Functions guide says deployed external calls use the app identity,
currently the Fabric app item's owner. Local builder credentials are not evidence
of deployed app permissions.

The installed public `AudienceType` declaration has only `Sql`, `Storage`,
`Fabric`, `AzureAI`, and `ADO`. This implementation neither reads internal
audience maps nor retargets a Fabric token to Power BI. Every HTTP request goes
to `https://api.fabric.microsoft.com/v1/` through the bounded Fabric client.
Returned URLs, model connection strings and report references are never called.
The installed CLI's `npx rayfin connector types --json` confirms the
`fabric-semanticmodel` contract: `allowedAuthTypes: ["delegated"]`, only
`executeQuery`, and required fixed `workspaceId`/`itemId` configuration.

Fabric SemanticModel and Report `getDefinition` contracts explicitly support
service principals and managed identities. They require item read/write
permission, even though this collector only reads definitions, and exclude
encrypted-sensitivity-label items. Grant the deployed app identity the required
workspace/item permissions and enable the relevant service-principal Fabric
API tenant setting if that identity is a service principal.

The Fabric admin Get Item and List Item Access Details APIs also document
service-principal/managed-identity support. These APIs are **Preview**, require a
Fabric administrator or appropriately approved service principal, and each has
a 200-requests/hour limit. `includeAdminEvidence` explicitly opts into those
calls; deployment does not grant tenant approval. An ordinary item owner's
workspace role alone must not be assumed sufficient.

## Function request and returned evidence

Inputs are `protocolVersion: 1`, one workspace UUID, 1-8 unique
`{id, type: "Report" | "SemanticModel"}` records, a strict boolean
`includeAdminEvidence`, and a correlation UUID or explicit `null`. No token,
endpoint, connection string, DAX query or definition payload is accepted.
Named input aliases preserve raw values for strict server validation.

The collector first verifies each item UUID, type and workspace through Fabric
Items. Definition failures do not prevent independently authorized owner/access
evidence, unless the execution/request budget has stopped the slice.

| Evidence | Public route or definition part | Returned coverage |
| --- | --- | --- |
| Model/report identity | Fabric Items Get Item | Verified UUID, type, workspace and display name |
| Semantic schema | SemanticModels Get Definition with `format=TMSL`, `model.bim` | Tables, columns, data types, source-column names, hidden flags, measures |
| Selected DAX definitions | `model.bim` measure and calculated-column expression fields | DAX structure with string literals redacted and comments removed; unsafe/inline-row expressions explicitly omitted |
| Model relationships | `model.bim` relationships | Named, validated table/column endpoints and active flag |
| Static object dependencies | Qualified object and uniquely resolved unqualified measure references in selected sanitized DAX | Labeled static subset, never engine completeness; unresolved or ambiguous references omitted |
| Report model binding | `definition.pbir` | Documented v1 `pbiModelDatabaseName` or v2 `semanticmodelid` UUID only; contradictory IDs fail |
| Report pages | PBIR `definition/pages/<name>/page.json`, optional `pages.json` | Names, display names and explicit order when returned |
| Owner | Fabric Admin Get Item with required `type` query | Exact `creatorPrincipal` evidence and source; never inferred from `defaultIdentity`, access grants or workspace roles |
| Modified date and tags | Fabric Admin Get Item | Selected `lastUpdatedDate` and tag UUID/display-name metadata |
| Access | Fabric Admin List Item Access Details with required `type` query | Principal identity/type, permissions and additional permissions, labeled Preview evidence |
| Item lineage subset | Verified model binding plus independently verified same-workspace item identities | Model-to-report edges only |

`schema` and selected `itemMetadata` have RawSync-compatible shapes.
`models`, `reports`, `ownerEvidence` and `accessEvidence` retain more precise
source evidence instead of inventing legacy scanner fields. Permissions remain
exact strings, not inferred effective access. Group membership expansion,
workspace inheritance and tenant-wide effective access are not claimed.
`scannerMatched` stays false. The envelope is `authoritative: false`, has its
own `powerbi-metadata` stage, and must not be passed off as a complete RawSync
snapshot.

Every requested item has separate identity, definition, schema, expressions,
dependencies, pages, binding, ownership, tags and access statuses. Summary
statuses cannot turn a mixed supported/unsupported collection into complete
coverage. The envelope's fixed `coverage` fields record these scopes.
`complete` always means the selected scope in this table, not scanner
parity. Definitions may succeed while a sub-capability is unavailable.
An explicitly empty access list is valid; missing or malformed access is not.
Unexpected access continuation fields fail closed because that endpoint does
not document pagination.

## Unavailable capabilities and minimum remaining blocker

The envelope carries dated blockers rather than registering functions that
cannot run with a supported deployed identity:

- `scannerParity/powerbi-audience-unavailable`: Rayfin 1.36.2 provides no
  documented deployed Power BI REST application audience or admin-scanner
  connector. Power BI `getInfo`, scan status/result and Reports Get Pages are
  therefore not called by the Fabric-token tranche. Full scanner item lineage, datasource/upstream
  boundaries, scanner-specific owners, endorsement and sensitivity remain
  unavailable.
- `engineDependencies/application-semantic-model-connector-unavailable`:
  the installed `fabric-semanticmodel` connector supports only delegated
  `executeQuery`, binds a model at authoring time, and does not provide a
  Functions application-identity metadata surface. INFO functions can expose
  engine metadata on a supported model host, but Power BI REST `executeQueries`
  explicitly excludes INFO/DMV. Static references and model relationships do
  not substitute for engine-resolved dependencies.
- `mashupAndCalculatedTableExpressions/metadata-only-policy`: partitions,
  M sources, calculated-table source expressions, model annotations, role
  filters and member lists are not returned. Sources can embed secrets or
  business values. Measures and calculated-column DAX retain only the selected
  sanitized expression scope.
- `legacyReportPages/pbir-legacy-pages-unsupported`: PBIR-Legacy `report.json`
  internals are not a reviewed public page contract. A legacy report may retain
  its documented model reference while its pages are unsupported. `byPath`
  references do not establish Fabric UUIDs and are not resolved by guessing
  folder/display names.

**Generic audience blocker:** provide a publicly
documented, deployed application-identity **Power BI REST token binding** or
server-side scanner connector in Rayfin. Its contract must cover
`POST /v1.0/myorg/admin/workspaces/getInfo`, scan status/result, and Power BI
report pages, without browser token forwarding or caller-supplied endpoints.
The optional Secret Store adapter is the supported alternative implemented in
this branch; it uses public client credentials for an explicitly approved
service principal rather than a generic Rayfin Power BI audience. A platform
upgrade is not required for that optional path. Its default state is disabled.

**Minimum tenant configuration for that path:** an eligible service principal
in the security group approved for **Service principals can access read-only
admin APIs**, with **Enhance admin APIs responses with detailed metadata** and
**Enhance admin APIs responses with DAX and mashup expressions** enabled.
The scanner application must not have admin-consent-required Power BI
permissions configured in Entra; `Tenant.Read.All` is a delegated-admin scope,
not a service-principal workaround. Verify the supplied identity and tenant
settings with a deployed scan, rather than relying on the builder's login.

That scanner path would close the scanner schema/access/owner/item-lineage and
legacy-page identity gap. Engine dependency completeness additionally needs a
documented application-authenticated XMLA/INFO metadata connector and model
permissions, or a reviewed equivalent metadata contract. Neither a delegated
browser connector nor ordinary business-data DAX satisfies an engine-completeness
claim. The Python path currently feeds static DAX references to the frontend;
engine completeness is not an extra prerequisite invented for its removal.

Full UDF removal also requires the existing synchronization publisher to consume
verified stage envelopes and pass the required RawSync coverage checks. This
change deliberately keeps the first-sync gate, staged progress, snapshot
publisher and UI untouched. It is a supported partial replacement, not a cutover.

## Resource and privacy bounds

The shared client bounds each request to 20 seconds, retries transport/429/5xx
failures at most three times, limits Retry-After to 10 seconds, rejects redirects,
and sanitizes all errors to fixed codes. A slice has a 150-second deadline and
120 HTTP-attempt budget. Definitions have a 16 MiB wire limit, 8 MiB decoded
selected-part budget, 4,096-part limit, 20,000-object projection limit and 12
LRO polls. Access has at most 2,000 entries per item. PBIR pages have a 500-page
limit. The final envelope is capped at 20 MiB and cannot contain the app token.

Only selected parts are decoded. Copilot instructions, resources, bookmarks,
visual payloads, report filter values and legacy sections remain unread.
Descriptions, raw source queries, connection strings, partitions, business
rows and DAX query results never leave the collector. DAX definitions are never
executed. No collector writes metadata, credentials or raw upstream responses.

## Verification

Focused tests cover caller authorization before token access, input/path/query
allowlists, verified identities, cross-workspace/unresolved model boundaries,
safe DAX and instruction exclusion, malformed/base64/oversized definitions,
permissions and Preview access evidence, honest capability statuses, bounded
transport and generated contracts.

Regenerate from the isolated root with `npx rayfin functions init` without
`--force`. Retain generated `types.ts` and `runtimemetadata.json`; discard its
unrelated agent-skill refresh. Run the Power BI and shared collector tests,
`npm run typecheck`, scoped ESLint, and `npm --prefix rayfin/functions run build`.
Unit fixtures and successful builds prove contract behavior, not live tenant
permissions or deployed parity; no deployment was attempted by this tranche.

## Public contract references

Reviewed on 2026-10-02:

- [SemanticModels Get Definition](https://learn.microsoft.com/en-us/rest/api/fabric/semanticmodel/items/get-semantic-model-definition) and [TMSL/TMDL parts](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/semantic-model-definition).
- [Reports Get Definition](https://learn.microsoft.com/en-us/rest/api/fabric/report/items/get-report-definition), [report parts](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/report-definition), and [PBIR binding/page format](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report).
- [Fabric Admin Get Item](https://learn.microsoft.com/en-us/rest/api/fabric/admin/items/get-item) and [List Item Access Details](https://learn.microsoft.com/en-us/rest/api/fabric/admin/items/list-item-access-details).
- [Power BI scanner getInfo](https://learn.microsoft.com/en-us/rest/api/power-bi/admin/workspace-info-post-workspace-info), [service-principal admin approval](https://learn.microsoft.com/en-us/fabric/admin/enable-service-principal-admin-apis), and [metadata scanning tenant settings](https://learn.microsoft.com/en-us/fabric/admin/metadata-scanning-setup).
- [Power BI Execute Queries limitations](https://learn.microsoft.com/en-us/rest/api/power-bi/datasets/execute-queries) and [INFO.DEPENDENCIES](https://learn.microsoft.com/en-us/dax/info-dependencies-function-dax).
- Version-locked Rayfin 1.36.2 package docs: `rayfin-guide:functions/connections/index.md`, `rayfin-guide:functions/index.md`, and `rayfin-guide:cli/connectors/category-b-function-bridge.md`; installed public `fabric-user-data-functions/dist/types/connection.d.ts`.
