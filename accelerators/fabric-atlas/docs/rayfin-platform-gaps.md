# Rayfin platform gaps

Assessment: **3 October 2026, Rayfin 1.36.2**.

Fabric Atlas 2.0 is Rayfin-first. Typed Rayfin Functions collect the catalog,
definitions, SQL and KQL structure, Item Relations, source provenance and
policy evidence. Python remains only where Rayfin does not expose the required
runtime contract.

## What is missing

### To remove the Python compatibility UDF

| Missing Rayfin capability | Atlas evidence still collected in Python | Exit condition |
|---|---|---|
| Documented Power BI application audience or first-party scanner connector | Admin scanner metadata, access and authoritative scanner lineage | A deployed Function can call `admin/workspaces/getInfo`, poll scan status/result and return the reviewed metadata-only projection |
| Supported PBIR-Legacy report-page path | Page inventory for legacy reports | Rayfin Power BI collection covers both modern PBIR and PBIR-Legacy reports with application identity |
| Documented Kusto application audience | Live Kusto schema fallback | A deployed Function receives a supported Kusto token and can run the bounded metadata command |

When these three contracts exist and pass live parity, `sync_compatibility` can
be removed.

### To run synchronization without an open browser

| Missing Rayfin capability | Current consequence | Exit condition |
|---|---|---|
| Supported unattended timer or trigger | Synchronization must be started in the browser | A Function can start a workspace run on a schedule with application identity |
| Distributed claim or lease primitive | No safe multi-host continuation owner | One worker can claim a task slice idempotently and another cannot publish it |
| Same-database transaction or fencing primitive | Publication cannot be atomically tied to checkpoints | Snapshot rows, task state and manifest visibility can be committed or rejected together |
| Supported continuation contract | Closing the browser stops future slices | A durable run can resume after worker or browser interruption without replaying delegated tokens |

Atlas does not store or replay browser access or refresh tokens to work around
these gaps.

### To complete access-policy evidence

| Missing public contract | Current Atlas state |
|---|---|
| OneLake security role membership and data scope | Unsupported, portal review required |
| Purview DLP restriction state | Unsupported, Purview review required |
| Fabric Policies evaluation operation | Unavailable unless a verified tenant contract is supplied |

These policy gaps do not require Python and do not block catalog publication.
They remain explicit coverage states.

## Active Rayfin collection

- `workspaceCollectCore`
- `workspaceCollectDefinitions`
- `workspaceCollectPowerBi`
- `workspaceCollectItemRelations`
- `workspaceCollectKqlMetadata`
- `workspaceCollectSqlMetadata`
- `workspaceCollectSourceProvenance`
- `workspaceCollectAccessPolicyEvidence`

The browser validates and merges these bounded envelopes, requests only the
exact compatibility plan, then publishes through the manifest-last writer.

## Retained Python compatibility

`sync_compatibility` can collect only the requested plan:

- Power BI admin scanner evidence;
- semantic-model scanner fallback when a definition is unsupported;
- PBIR-Legacy pages;
- Kusto live metadata.

`sync_all` and `sync_items` remain explicit rollback paths.

The UDF keeps:

- a 180-second deadline;
- bounded retries and `Retry-After`;
- same-origin continuation validation;
- page, record and response-size limits;
- metadata-only allowlists.

It never returns business rows, credentials, connection strings, prompts,
few-shot examples or query text.

## Scheduling decision

Scheduled refresh stays disabled until Rayfin provides the unattended trigger,
identity and distributed ownership contracts above.

Browser-driven multi-workspace synchronization is supported now. Each workspace
publishes an independent snapshot and a failed workspace does not invalidate
another workspace.

## Removal checklist

The Python UDF can be deleted only when:

1. Power BI scanner parity passes in the target tenant.
2. PBIR-Legacy pages are covered.
3. Kusto live schema parity passes.
4. No compatibility collector remains in the browser plan.
5. Failure isolation and last-known-good publication still pass.

Unattended scheduling is a separate gate. Removing Python does not by itself
provide a timer, durable continuation or distributed claim ownership.
