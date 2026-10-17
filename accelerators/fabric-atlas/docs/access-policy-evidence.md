# Access policy evidence: verified scope and live gate

Verified on 2 October 2026 against the public Microsoft references below.
This addition is metadata-only and has not been deployed or live-tested.

## Supported contract

The read-only adapter collects **workspace policy settings**, not central Fabric
Policies evaluation and not a principal/item data-access decision.

| Operation | Fixed GET path under `https://api.fabric.microsoft.com` | Persisted fields |
| --- | --- | --- |
| [Get Network Communication Policy](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/get-network-communication-policy) | `/v1/workspaces/{workspaceId}/networking/communicationPolicy` | Explicit `inbound.publicAccessRules.defaultAction` and `outbound.publicAccessRules.defaultAction`, each `Allow` or `Deny` |
| [Get Inbound External Data Shares Policy](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/get-inbound-external-data-shares-policy) | `/v1/workspaces/{workspaceId}/networking/communicationPolicy/inbound/externalDataShares` | Explicit `defaultAction`, governing the external-share network bypass exception |

Both references require Viewer or higher workspace role and document delegated
`Workspace.Read.All` or `Workspace.ReadWrite.All`. Both support user, service
principal and managed identities. This is documentation support, not proof that
the current Fabric Function connection has those effective privileges.

An observed `Deny` describes that **network setting**, not denied principal access.
An observed `Allow` does not prove unrestricted access. A missing GET field remains
missing; the documented PUT default of `Allow` is never applied to a read result.
Missing one networking setting produces partial evidence. HTTP 401/403 means a
denied evidence read; unsupported endpoints and other failures remain distinct.

## Exact central-evaluation blocker

The [Fabric Policies REST overview](https://learn.microsoft.com/en-us/fabric/governance/fabric-policies-rest-api)
names a runtime evaluation operation returning Allow, Denied or System default,
but does not publish its HTTP path/method, required request context, response
property schema or operation-specific permissions. The
[current Fabric REST TOC](https://learn.microsoft.com/en-us/rest/api/fabric/toc.json)
and [Microsoft public API specification repository](https://github.com/microsoft/fabric-rest-api-specs)
(tree reviewed at `a070c71d797d196c12d303d54ca40fa259872e1f`) expose workspace
network policy operations, but no central Policy Evaluation operation.

The earlier research described the conceptual evaluation surface as a complete
read contract. It is not a sufficient implementation contract. The adapter
therefore makes **no guessed evaluation POST**, and persists a separate
`fabric-policies-evaluation` entry with `unsupported`,
`evaluation-contract-unverified`, an attempt time and **no observation time**.

Omitted fields include central policy/rule IDs, activation state, applicable
admin scope, evaluated principal, action/resource request context and any
allow/deny/default *evaluation decision*. No policy definition JSON, conditions,
free-text rules or raw upstream error bodies are stored. The workspace settings
GETs are not silently relabeled as centralized Fabric Policies evaluation.

OneLake role membership/data scope and Purview DLP restriction state still have
no verified public read contract here. They remain unknown/manual; nothing in
these network settings is used to infer them, group expansion or row/column
security.

## Persistence and read boundary

`AccessPolicyEvidence` is additive to the existing Rayfin schema. Each immutable
observation carries workspace UUID, catalog snapshot UUID, collection UUID,
source/version, fixed reason and coverage vocabulary, attempt time, optional
actual observation time and only the three approved setting fields.

Authenticated app-audience reads are shared, just like catalog metadata.
Create requires the immutable configured synchronizer subject and its caller
email matching `writerEmail`; delete is synchronizer-only for reviewed retention.
Update and anonymous access are absent. Scope removal checks this shared entity
too, so retained policy metadata is not silently orphaned by scope removal.

The Function validates strict IDs, checks the synchronizer authority sentinel,
and verifies a published `Workspace` manifest for the workspace/snapshot before
reading its opaque Fabric connection token. The trusted manifest supplies writer
email; clients cannot supply it, a URL, a token, a principal or a policy body.
The token stays in memory. Connection identity remains explicitly
`fabric-function-connection-unverified`, rather than guessing its Entra subject.

Two fixed GETs have a shared 35-second network deadline, six-second request
timeouts, at most two attempts per GET, four HTTP attempts overall, bounded
Retry-After (two seconds) and 16 KiB streamed responses. Redirects are rejected.
Each invocation can create only three projected observations. These are optional
metadata rows, not a new catalog manifest; failure never republishes or mutates
grants or the last-known-good catalog. Each observation is independently scoped
and timed; mixed observation times are not a historical policy snapshot.

Readers request at most one newest observation per kind, bounded to three
queries, for the exact active workspace and catalog snapshot. Invalid records,
cross-snapshot responses, late responses and missing schema fail closed. Old
rows remain immutable; no successful zero/empty read certifies absence of policies.
Catalog snapshot time is not substituted for per-source observation time.

Access Review displays stored context in its inspector and keeps the Restrictions
assessment `Not evaluated`. Exports include source URLs, per-record coverage,
attempt/observation times and the identity limitation. What-if exports label
policy context **not modeled**; settings never change the additive grant result.
Personal review decisions remain grant-bound, not policy compliance certification.

## Live gate: CLOSED, default off

The existing `VITE_ATLAS_FEATURE_FABRIC_POLICIES` flag defaults off and prevents
UI evidence reads/collection controls. The independent server gate
`RAYFIN_ATLAS_FEATURE_FABRIC_POLICIES` requires the exact value `true`; otherwise
the Function returns off before authority checks, tokens, Fabric requests or
evidence writes. A browser flag cannot override the server gate. What-if never
offers collection/write controls.

Before enabling either gate in a separately authorized deployment:

1. Apply the additive schema and regenerate Functions runtime metadata/types
   through the supported Rayfin CLI. Generated files must not be hand-edited.
2. Verify actual Fabric connection identity, its workspace role/scopes,
   tenant/region endpoint availability and app-audience disclosure approval.
3. Verify the synchronizer can persist records; a non-synchronizer cannot invoke
   collection or mutate/delete evidence; every admitted app reader can read it.
4. Confirm the published snapshot affinity, exact two GETs, malformed/omitted
   fields, 401/403, 404, 429, redirects and size/deadline failures without changing
   required metadata. Confirm no grants, networking settings or policies are written.
5. Obtain and review a public **central evaluation** operation contract before
   implementing any decision/applicability fields. That blocker is independent of
   enabling these verified workspace-context reads.

No deployment, tenant-setting change, Fabric permission mutation, policy
activation or write-back was performed for this implementation.
