# JSON Export Service Knowledge

Conventions and layout for `services/structured_export_service.py` —
the service that materializes `SynapseAssessment` /
`DatabricksAssessment` dataclasses into the on-disk JSON tree consumed
by the HTML generator, downstream tools, and humans.

> Companion docs: [`html-generator.md`](./html-generator.md) is the
> primary consumer of what this service writes and must unwrap the
> `{kind}_data` envelope documented here.
> [`synapse-platform.md`](./synapse-platform.md) and
> [`databricks-platform.md`](./databricks-platform.md) describe the
> upstream dataclasses being serialized.

## Class Layout

```
StructuredExportService
 └── exporters: { "json": JSONExporter, "csv": CSVExporter, "parquet": ParquetExporter }

BaseExporter (ABC)
 ├── JSONExporter      — the only fully-implemented exporter
 ├── CSVExporter       — scaffolding only (prints a TODO banner)
 └── ParquetExporter   — scaffolding only (prints a TODO banner)

DecimalEncoder(json.JSONEncoder)
 └── serializes `Decimal` as `str` (table-statistics DMV rows come back
     from `mssql-python` as Decimal and would otherwise break json.dump)
```

`StructuredExportService.export_assessment(data, workspace_name,
output_path, format="json")` is the public entry point. Callers
(`AssessmentService`) pass the typed assessment dataclass and a format
string; unknown formats raise `ValueError`.

## Format Support Status

| Format  | Status                | Notes                                                          |
|---------|-----------------------|----------------------------------------------------------------|
| json    | **Implemented**       | Full nested folder tree. This doc describes it.                |
| csv     | Scaffolding only      | `CSVExporter.export` prints a message and returns a stub dict. |
| parquet | Scaffolding only      | `ParquetExporter.export` prints a message and returns a stub dict. |

CLI `--format csv` / `--format parquet` will run without error but
produce no files. When implementing either, mirror the JSON exporter's
directory contract where possible so downstream consumers can be
polymorphic.

## JSON Output Layout

Per-workspace tree written under `<output_path>/<workspace_name>/`:

```
<workspace>/
├── summary.json              # assessment_data.get_summary() — top-level counts
├── workspace.json            # Synapse only: wrapped workspace_info
├── resources/                # flat per-kind folders, one JSON file per item
│   ├── notebooks/
│   ├── pipelines/            # Synapse + Databricks (DLT)
│   ├── sql_pools/            # Synapse dedicated + serverless pool summaries
│   ├── spark_pools/          # Synapse
│   ├── dataflows/            # Synapse
│   ├── sql_scripts/          # Synapse
│   ├── libraries/            # Synapse
│   ├── clusters/             # Databricks
│   ├── sql_warehouses/       # Databricks
│   ├── jobs/                 # Databricks
│   ├── repos/                # Databricks
│   ├── experiments/          # Databricks (MLflow)
│   ├── serving_endpoints/    # Databricks (Model Serving)
│   ├── alerts/               # Databricks (SQL Alerts)
│   ├── genie_spaces/         # Databricks
│   ├── cluster_policies/     # Databricks
│   ├── instance_pools/       # Databricks
│   ├── external_locations/   # Databricks (UC)
│   ├── connections/          # Databricks (UC)
│   └── secret_scopes/        # Databricks
├── admin/                    # Synapse only
│   ├── integration_runtimes/
│   ├── linked_services/
│   ├── datasets/
│   └── managed_private_endpoints/
└── data/                     # nested DB → schema → table/view/volume/function
    ├── serverless_databases/databases/<db>/<db>.json
    │                              └── schemas/<schema>/<schema>.json
    │                                          ├── tables/<table>.json
    │                                          └── views/<view>.json
    ├── dedicated_databases/databases/<db>/...         # Synapse, same shape
    ├── unity_catalog/catalogs/<catalog>/<catalog>.json   # Databricks UC
    │                      └── schemas/<schema>/<schema>.json
    │                                  ├── tables/<table>.json
    │                                  ├── volumes/<volume>.json
    │                                  └── functions/<function>.json
    └── legacy_databases/databases/<db>/<db>.json         # Databricks pre-UC
```

`summary.json` is written unwrapped (it's metadata, not a resource).
Every other file uses the envelope below.

## Wrapped Resource Envelope

Every per-resource JSON file has this shape:

```json
{
  "type": "<resource_kind>",
  "<resource_kind>_data": { ... typed payload (asdict of the dataclass) ... },
  "exported_at": "2026-04-23T14:00:00"
}
```

The payload key is `<kind>_data` (e.g., `job_data`, `cluster_data`,
`notebook_data`, `schema_data`, `table_data`, `pool_data`, …). A small
number of legacy call sites use `"data"` instead — see the helper
`JSONExporter._export_component`. **Consumers must unwrap with fallback**:

```python
payload = item.get(f"{kind}_data") or item.get("data") or item
```

The `{kind}_data` keys currently emitted are the union of every
`"type":` literal you'll find in `structured_export_service.py`:

- **Synapse** — `synapse_workspace`, `dedicated_pool`, `serverless_pool`,
  `serverless_database`, `dedicated_database`, `schema`, `table`, `view`,
  `spark_pool`, `notebook`, `pipeline`, `dataflow`, `sparkjobdefinition`
  (names mirror the resource-folder naming).
- **Databricks** — `databricks_cluster`, `databricks_job`,
  `databricks_sql_warehouse`, `notebook`, `databricks_pipeline`,
  `databricks_repo`, `databricks_experiment`,
  `databricks_serving_endpoint`, `databricks_alert`,
  `databricks_genie_space`, `databricks_cluster_policy`,
  `databricks_instance_pool`, `databricks_external_location`,
  `databricks_connection`, `databricks_secret_scope`, `legacy_database`,
  `unity_catalog`, `schema`, `table`, `volume`, `function`.

If you introduce a new resource type, **add both a `"type"` literal and
a `<kind>_data` key, and update the HTML templates' unwrap fallback
list** — see `html-generator.md`.

## File Naming Rules

- Default: `<item.name>.json`. Items without a `name` field will crash
  the exporter; if you add a resource whose identity is something else
  (e.g., Databricks job IDs), either synthesize a `name` before export
  or extend `_export_component` to take a name-extractor callable.
- Dedicated SQL pool files are prefixed `dedicated_pool_<name>.json`
  and serverless pool files `serverless_pool_<name>.json` inside the
  shared `sql_pools/` directory (so both kinds can coexist without
  colliding on an identical pool name).

## Serialization Rules

- **Always use `DecimalEncoder`.** Synapse DMV statistics surface as
  `Decimal` and stock `json.dump` will raise. Any new `json.dump` call
  added to this file must pass `cls=DecimalEncoder`.
- **`asdict(assessment_data)` is called once** at the top of
  `JSONExporter.export`; subsequent per-component exporters read from
  that dict, not the original dataclass. Add new resources to the dict
  representation by exposing them as dataclass fields, not by hand.
- `exported_at` uses `datetime.now().isoformat()`; no timezone suffix.
  If ever made timezone-aware, update the HTML generator to parse both.

## Adding a New Exported Resource Type

1. Ensure the dataclass is a field on `SynapseAssessment` /
   `DatabricksAssessment` so it lands in `asdict(...)` automatically.
2. In `_export_synapse_details` or `_export_databricks_details`, either:
   - Call the generic `_export_component(data, key, resources_dir,
     folder_name, file_type, files_created, property=<list_field>)`
     helper if the collection wrapper has a standard
     `{plural}: List[...]` field, **or**
   - Add a bespoke loop (mirroring the Databricks job/warehouse blocks)
     when you need custom naming or nested sub-folders.
3. Wrap each item with `{ "type": "<kind>", "<kind>_data": item,
   "exported_at": ... }` and append the full path to `files_created`.
4. Add the `<kind>_data` key to the list of unwrap keys documented in
   `html-generator.md` and update the relevant templates' fallback
   chains.
5. If the new resource lives under `data/` (databases/schemas/...),
   mirror the existing nested-folder pattern in
   `_export_synapse_serverless_databases` /
   `_export_synapse_dedicated_databases` /
   `_export_databricks_unity_catalogs`.

## Return Value Contract

`JSONExporter.export` returns:

```python
{
    "format": "json",
    "workspace_directory": "<absolute path to per-workspace folder>",
    "files_created": [<list of every file written, absolute paths as strings>],
    "total_files": <int>,
}
```

`AssessmentService` uses `total_files` and `workspace_directory` for
console output and for the aggregated `assessment_summary.json`. Keep
this contract stable: any stub exporter (CSV/Parquet) must return a
dict with at least `format` and `workspace_directory`.

## Gotchas

- **Name collisions across pool types** are handled by the explicit
  `dedicated_pool_` / `serverless_pool_` filename prefixes. Any new
  coexisting-kind pair needs the same treatment.
- **Empty collections produce empty folders.** `mkdir(exist_ok=True)` is
  called even when the list is empty. If an empty folder bothers
  downstream tooling, guard the `mkdir` call with a length check — but
  note the HTML generator currently tolerates empty folders fine.
- **`data["sql_pools"].get("serverless_pools", [])` in `_export_component`
  is legacy** (the current dataclass exposes a single `serverless_pool`,
  not a list). That branch exists for forward-compatibility and should
  stay a no-op today; don't rely on it.
- **Do not remove the bare `"data"` fallback** used by
  `_export_component`. Some older per-resource files in the wild still
  use `"data"` instead of `<kind>_data`, and the HTML generator's
  unwrap chain depends on both.
