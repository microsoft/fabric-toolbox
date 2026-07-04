# Databricks Platform Knowledge

Platform-specific conventions and API quirks for the Databricks scanner in
`clients/databricks_client.py` and `assessment/databricks.py`. Read this
before changing anything Databricks-related — a lot of it is non-obvious
and was learned the hard way.

## Azure Databricks Workspaces (ARM / Management Plane)

### Resource listing endpoints

Two endpoints are relevant:

| Purpose                              | Path                                                                                                 |
|--------------------------------------|------------------------------------------------------------------------------------------------------|
| List workspaces in a subscription    | `GET /subscriptions/{sub}/providers/Microsoft.Databricks/workspaces?api-version=2026-01-01`          |
| Get a single workspace's properties  | `GET /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Databricks/workspaces/{name}?api-version=2026-01-01` |

`DatabricksClient.get_workspaces()` uses the LIST endpoint and caches the
result. `_get_workspace_info(name)` reads from that cache first.

### API version matters — use `2026-01-01`

The authoritative workspace-type field `properties.computeMode` (values:
`"Hybrid"` | `"Serverless"`) **only appears on api-version
`2025-10-01-preview` or later**. Older versions (`2024-05-01`, etc.) do
not return it. `ApiClient(..., api_version="2026-01-01")` is the
configured default in `authenticate()`.

### Workspace-type classification

Populated in `_build_workspace_info` and surfaced as
`DatabricksWorkspaceInfo.workspace_type`. Order of resolution:

1. **Authoritative**: `properties.computeMode` (lowercased → `"hybrid"`
   or `"serverless"`).
2. **Fallback (older api-versions)**: `"hybrid"` if the workspace has a
   managed resource group, else `"serverless"`.

> **Do not fall back on `vnet_injected`.** Hybrid workspaces running on
> Databricks' own managed VNet (e.g., `jdc-adb`) have no
> `customVirtualNetworkId` either — only the presence of
> `managedResourceGroupId` reliably distinguishes Hybrid from Serverless
> when `computeMode` is absent.

### Network topology fields

All derived from the ARM response and grouped under both the flat
`DatabricksWorkspaceInfo` fields and the nested
`DatabricksNetworkSettings` object:

| Field                        | Source                                                   |
|------------------------------|----------------------------------------------------------|
| `vnet_injected`              | `bool(properties.parameters.customVirtualNetworkId.value)` |
| `custom_virtual_network_id`  | `properties.parameters.customVirtualNetworkId.value`    |
| `uses_private_endpoints`     | `len(privateEndpointConnections) > 0` OR `publicNetworkAccess == "Disabled"` |
| `private_endpoint_count`     | `len(properties.privateEndpointConnections)`            |
| `public_network_access`      | `properties.publicNetworkAccess` — defaults to `"Enabled"` when ARM returns null (matches Azure's implicit default) |
| `no_public_ip` (NPIP)        | `properties.parameters.enableNoPublicIp.value` (bool, Hybrid only) |
| `managed_resource_group`     | Last path segment of `properties.managedResourceGroupId` |

Notable: `publicNetworkAccess` is **only explicitly set on newer
workspaces or Private Link configurations** — Hybrid workspaces on
managed VNet typically return `null`. We normalize to `"Enabled"`
because that is what Azure infers; never display `N/A`.

### What you cannot infer

- A missing `customVirtualNetworkId` does **not** mean Serverless; it
  means "managed VNet" (Hybrid is still possible).
- `managedResourceGroupId` is **always populated** for Hybrid, always
  empty for Serverless — this is the reliable fallback signal.
- `requiredNsgRules` is only set on Private Link configurations.

## Databricks Jobs API

### Duration fields

`execution_duration` is **deprecated in Jobs API 2.1+** and returns `0`
for runs of modern jobs. Use this priority order (implemented in
`_run_duration_ms`):

1. `run_duration` (wall-clock total, current preferred field)
2. `execution_duration` (legacy, non-zero only on old runs)
3. `setup_duration + execution_duration + cleanup_duration` (original
   3-component model)

`DatabricksJob.avg_duration_ms_last_3_runs` is computed with this
helper over the newest three runs returned by `/api/2.1/jobs/runs/list`.

### Job cluster naming

Ephemeral job clusters follow the pattern:

    job-{job_id}-run-{run_id}-{task_key}

e.g., `job-1086621515171220-run-1016038592983259-tpcds_gen_cluster`.

To group by "Source" (the originating job) and keep the latest instance
per source, split on `-run-` and take `[0]`, then keep the entry with
the maximum `start_time`. `cluster_source == "JOB"` identifies these
ephemeral clusters; all-purpose compute has `UI` or `API`.

### Runs per job

FAT currently fetches the latest **3 runs** per job (hardcoded in
`_build_job`). If making this configurable, surface a CLI/config knob
rather than scattering constants.

## Databricks Workspace API (notebooks, repos, etc.)

- Notebook `object_size` is returned by `GET /api/2.0/workspace/get-status`
  with `return_size=true` (mapped to `DatabricksNotebook.size` in bytes).
- `uses_dbutils` is inferred by fetching the notebook source
  (`/workspace/export`) and regex-matching for `dbutils.` references.
- Repos come from `GET /api/2.0/repos?path_prefix=/Workspace/Repos` —
  **omitting `path_prefix` returns an empty list** despite docs.

## MLflow API

Use `GET /api/2.0/mlflow/experiments/list` (not the POST
`/search` endpoint) when no filters are needed. POST `/search` was the
pattern in early drafts of the scanner but is unnecessarily heavier.

## Model Serving / SQL Alerts / Genie Spaces

These endpoints are **optional on older workspaces** and return 404. The
scanner treats 404 as "feature not enabled" and yields an empty
collection rather than raising.

## Rate limiting

The Databricks SDK raises `RetryAfter` with a `Retry-After` header.
The scanner uses a **case-insensitive `.get("Retry-After", 5)`** because
`urllib3`'s header case varies across versions. The retry log line is
gated behind the `DEBUG` env flag to avoid noise.

## JSON Shape Convention

Every exported resource JSON wraps the typed payload inside a `*_data`
key matching the resource kind, e.g.:

```json
{
  "type": "databricks_job",
  "job_data": { "job_id": ..., "settings": {...}, "tasks": {...} }
}
```

Templates and aggregators must unwrap the correct key with fallbacks:
`item.<kind>_data or item.data or item`. Don't read flat fields
directly off `item`.
