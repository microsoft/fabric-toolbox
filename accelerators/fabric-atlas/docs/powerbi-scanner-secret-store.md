# Optional Power BI scanner through Rayfin Secret Store

Contract review: **2026-10-02, Rayfin 1.36.2**.

`workspaceCollectPowerBiScanner` supplies a supported, optional server-side
identity path for the public Power BI admin scanner. It is disabled unless a
deployment administrator explicitly provisions its Secret Store configuration.
It does not use browser tokens, `ctx.Tokens.Fabric`, an internal audience map,
private endpoints, certificates fabricated by an agent, or a delegated connector.
This change creates no credential and provisions no secret value.

## Installed contract evidence

The installed 1.36.2 `rayfin-guide:functions/secrets.md` and
`rayfin-guide:cli/secrets.md` document encrypted secrets on the deployed Rayfin
item, delivered to Functions per invocation through typed `ctx.Secrets`.
Declared but missing values throw; the adapter catches those accessors without
returning their messages.

The installed CLI template
`templates/universal-app/.agents/skills/external-api-workflows/SKILL.md`
explicitly documents names-only declarations:

```yaml
secrets:
  - name: THIRD_PARTY_API_KEY
    description: Credential used only by a server-side request.
```

The candidate YAML contains only the six names/descriptions below, never values.
`npx rayfin functions init` successfully validates that declaration, builds the
Functions package and generates `secrets.generated.ts` with the six typed names.
The SDK's public `RayfinContext` declaration documents the deployed secret bag
and typed missing-secret behavior. No third-party secret manager or invented
Rayfin binding is needed.

The SDK has an environment fallback for local debugging. This adapter neither
reads `process.env` nor makes environment variables a deployment requirement:
production values must be provisioned through the deployed Rayfin Secret Store.
The root TypeScript project includes the generated names-only registry so tests
compile against the same declaration as Functions; no values or server runtime
are imported into the browser.

## Required secrets

Provision all values on the intended deployment using its masked CLI prompt.
Never paste a credential into chat, source, YAML, a frontend environment file,
command arguments, logs or a function request.

| Secret name | Required value |
| --- | --- |
| `ATLAS_POWERBI_SCANNER_TENANT_ID` | Approved commercial-cloud Entra tenant UUID; not `common`, a domain or a URL |
| `ATLAS_POWERBI_SCANNER_CLIENT_ID` | Dedicated approved scanner service principal's application/client UUID |
| `ATLAS_POWERBI_SCANNER_CLIENT_SECRET` | That application's existing valid client-secret value, not its secret identifier |
| `ATLAS_POWERBI_SCANNER_WORKSPACE_IDS` | JSON array of 1-100 unique approved workspace UUID strings |
| `ATLAS_POWERBI_SCANNER_SETTINGS_CONFIRMED` | Exact string `true`, after the tenant checks below |
| `ATLAS_POWERBI_SCANNER_ENABLED` | Exact string `true` to enable; missing, empty or `false` disables |

Deploy the code first, then provision values; the public secret command requires
an active remote deployment. Use the repository's approved tenant/workspace
deployment workflow and verify the target endpoint before provisioning.
Set `ENABLED` last:

```powershell
npx rayfin secret set ATLAS_POWERBI_SCANNER_TENANT_ID
npx rayfin secret set ATLAS_POWERBI_SCANNER_CLIENT_ID
npx rayfin secret set ATLAS_POWERBI_SCANNER_CLIENT_SECRET
npx rayfin secret set ATLAS_POWERBI_SCANNER_WORKSPACE_IDS
npx rayfin secret set ATLAS_POWERBI_SCANNER_SETTINGS_CONFIRMED
npx rayfin secret set ATLAS_POWERBI_SCANNER_ENABLED
```

Each command prompts for a masked value. `npx rayfin secret list` lists names and
timestamps, not values. Rotate with the same masked command. Set `ENABLED` to
`false` to disable before removing or rotating other configuration.
No provisioning or live invocation has been performed by this change.

## Exact tenant setup

Use a dedicated service principal already approved by the tenant administrator.
Do not add Power BI delegated/admin-consent-required API permissions in Entra:
the public scanner contracts explicitly disallow those permissions for this
service-principal scenario. `Tenant.Read.All`/`Tenant.ReadWrite.All` are delegated
administrator scopes, not the scope used by this adapter.

The administrator must:

1. Add that service principal to the security group approved for
   **Service principals can access read-only admin APIs**.
2. Enable **Enhance admin APIs responses with detailed metadata** for the
   intended scanning audience.
3. Enable **Enhance admin APIs responses with DAX and mashup expressions**,
   which also requires the detailed-metadata setting.

Review the tenant's applicable security-group restrictions and model-scanning
availability before setting `SETTINGS_CONFIRMED=true`. That flag records operator
confirmation; it is not proof that remote settings are enabled. The response
must still contain the required schema, expressions, users and expected artifact
identities. A 401/403 from the scanner returns an explicit tenant approval blocker.
This admin scanner does not require inventing workspace member/admin grants or
embedding permissions; those are separate requirements for other Power BI APIs.

## Invocation and authorization

The registered handler has no generic resource audience. Inputs are
`protocolVersion: 1`, strict `tenantId` and `workspaceId` UUIDs,
`expectedItems` (up to 2,000 unique `{id, type}` records for public Power BI item
types from the current Fabric Core catalog), and a correlation UUID or explicit
`null`. Supported expected types are SemanticModel, Report, Dashboard, Dataflow
and Datamart. An empty expected list is explicit and only suitable when the
current catalog contains none of those types.

Inputs cannot include credentials, tokens, endpoints, scanner flags or an
enabled switch. Custom aliases prevent the SDK's primitive coercion/echoing from
replacing strict validation. `SynchronizerAuthority` authorization runs before
any secret read. The requested tenant must match the server-side tenant UUID,
and the workspace must appear in the server-side allowlist.

Caller-scoped Rayfin authorization and scanner service-principal authorization
are separate. A successful app login, local builder login or ordinary app-item
owner permission does not grant this scanner's tenant rights.

## Public protocol and limits

The adapter sends OAuth client credentials only to
`https://login.microsoftonline.com/{approvedTenantUuid}/oauth2/v2.0/token`,
with URL-encoded `client_id`, `client_secret`, `grant_type=client_credentials`,
and the fixed Power BI resource scope
`https://analysis.windows.net/powerbi/api/.default`.

It then uses only these public Power BI APIs:

- `POST /v1.0/myorg/admin/workspaces/getInfo`, one approved workspace,
  `lineage=true`, `getArtifactUsers=true`, `datasetSchema=true`,
  `datasetExpressions=true`; `datasourceDetails` is not requested.
- `GET /v1.0/myorg/admin/workspaces/scanStatus/{validatedScanUuid}`.
- `GET /v1.0/myorg/admin/workspaces/scanResult/{validatedScanUuid}`, only after a
  successful status poll.

The access token remains private to one invocation and is not cached or persisted.
The adapter never requests business-data DAX, INFO/DMV, rows, report definitions
or arbitrary URLs. Redirects and provider `Location` URLs are not followed.
OAuth/API failures return fixed codes, never provider bodies, request bodies,
credential values or exception details.

A slice has a 150-second deadline, 20-second request/body timeout, 100 HTTP
attempts, at most 30 polls, 2-second polling intervals, at most three safe retries
and a 5-second Retry-After ceiling. OAuth/status/start bodies are capped at
64 KiB, scan results at 16 MiB, output at 20 MiB, items at 2,000 and aggregate
projected objects/access/edge records at 20,000.

An ambiguous start failure is not retried because it could create a duplicate
scan. A definite 429 can retry within the budget. The public scanner has its own
500-start/result-requests/hour and 16-concurrent-scan limits; callers must
externally serialize and rate-limit authorized invocations across hosts.
This function introduces no distributed lease, unattended trigger or retry worker.

## Metadata projection and fail-closed behavior

The adapter reuses the reviewed semantic-model structure/DAX projection from
the Fabric definition tranche and returns existing RawSync-compatible `schema`,
`itemMetadata`, `access` and item-lineage record shapes. Only the five documented
public Power BI artifact families are projected. Scanner owners retain their
actual `configuredBy`/`createdBy` source. Endorsement, sensitivity UUIDs, tags and
modified timestamps are selected explicitly.

The projection drops table rows/counts, descriptions, M expressions, partition
sources, role members/filters, datasource/connection details, Copilot
instructions, dashboard tile text and other unused fields. Selected DAX strings
are redacted and comments removed; inline data constructors, credentials and
malformed expressions are omitted. DAX is never executed. The public scanner
Column/WorkspaceInfoDataset contracts do not define calculated-column
expressions or model relationships; those are not read from undocumented
fields. The existing Fabric TMSL stage supplies them when supported.

Official model/report, upstream and dashboard references produce edges only
when both endpoints are observed locally. Explicit external-workspace and
unresolved references remain bounded UUID-only boundary evidence; they are not
invented nodes or local edges. Engine dependencies, M/source expressions, full
Fabric item lineage and report pages remain explicitly unsupported in this
scanner stage. The separate Fabric definition stage provides supported PBIR pages.

Missing configuration, unconfirmed settings, denied admin access, missing model
tables, missing measure expressions, missing artifact users, or missing/mismatched
expected artifacts cannot produce `readyForScannerMerge: true`. Documented
`schemaMayNotBeUpToDate` and `schemaRetrievalError` also block merging without
exposing retrieval-error text. An explicitly
empty users list is valid; an absent users field is not equivalent to empty.
Malformed identities, collections, oversized results, cancellation and timeouts
return empty fail-closed envelopes. Critical credential/token text in a selected
output label also rejects the envelope.

`authoritative` always remains false. `readyForScannerMerge` describes the
required fields for this bounded scanner/Core comparison, not permission to
publish a snapshot. The active UI/publisher and Python UDF have not been cut over.
The generic Power BI audience remains absent in 1.36.2, but this separately
approved Secret Store service-principal path closes that scanner identity gap
without a platform upgrade. A deployed test with real operator-provisioned
credentials/settings remains required before production cutover.

## References and verification

- Installed Rayfin 1.36.2 Functions secrets guide, CLI secrets guide, external API
  workflow template and SDK public `RayfinContext`/secret registry declarations.
- [Public OAuth client credentials protocol](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow).
- [Power BI service-principal authentication](https://learn.microsoft.com/en-us/power-bi/developer/embedded/embed-service-principal).
- [Scanner getInfo](https://learn.microsoft.com/en-us/rest/api/power-bi/admin/workspace-info-post-workspace-info), [scan status](https://learn.microsoft.com/en-us/rest/api/power-bi/admin/workspace-info-get-scan-status), and [scan result](https://learn.microsoft.com/en-us/rest/api/power-bi/admin/workspace-info-get-scan-result).
- [Read-only admin API approval](https://learn.microsoft.com/en-us/fabric/admin/enable-service-principal-admin-apis) and [detailed metadata settings](https://learn.microsoft.com/en-us/fabric/admin/metadata-scanning-setup).

Focused tests use synthetic credentials and a mocked HTTP transport only. They
cover disabled/configuration/auth/scope boundaries, exact public OAuth/scanner
requests, bounded retries/polls/body/output, stalled requests/streams, malformed
metadata, secret/instruction exclusion, capability blockers and generated
names/contracts. Root typecheck, scoped ESLint and Functions build validate the
registered deployed-compatible path without creating credentials or claiming
live tenant validation.
