# HTML Generator Knowledge

Platform-agnostic and Databricks/Synapse-specific conventions for the
HTML visualization pipeline in
`services/visualization_service.py` and `templates/**`. Read this
before adding a view, a chart, or a new resource-type table — the
unwrapping, aggregation, and filtering patterns are load-bearing.

## Pipeline Overview

```
fat visualize -i ./databricks-output -o ./reports
     │
     ▼
VisualizationService.generate_report()
  │
  ├── _load_assessment_data()                    # walk input dir
  │     └── _load_workspace_data()               # per workspace
  │           ├── summary.json  → summary
  │           ├── resources/    → _load_resources()      (flat category → list[JSON])
  │           ├── data/         → _load_data_catalog()   (nested Unity Catalog tree)
  │           └── admin/        → _load_resources()      (Synapse only)
  │
  ├── _detect_platform(summary)                  # "synapse" | "databricks"
  │
  ├── _calculate_summary()                       # totals across workspaces
  │     ├── _add_synapse_counts()
  │     └── _add_databricks_counts()             # each platform has its own counter
  │
  └── _generate_{synapse|databricks}_report()
        ├── _generate_overview()                 # index.html
        ├── _generate_workspace_report()         # workspaces/<name>.html (per workspace)
        └── _generate_{admin,data_engineering,data_integration,data_warehousing}_view()
              └── _aggregate_{admin,data_engineering,data_integration,data_warehousing}()
```

## Template Layout

```
templates/
├── base.html                    # Master layout: navbar, CSS, Chart.js CDN,
│                                 # workspace filter JS, localStorage key "fat-workspace-filter"
├── index.html                   # Platform-agnostic redirect (picks synapse/ or databricks/)
├── workspace.html               # Fallback workspace detail (rarely used)
├── synapse/
│   ├── index.html               # Overview dashboard
│   ├── workspace.html           # Per-workspace detail
│   └── views/                   # (falls back to ../views/)
├── databricks/
│   ├── index.html               # Overview dashboard (Type column, badges)
│   ├── workspace.html           # Per-workspace detail (network panel, cluster split, jobs avg)
│   └── views/
│       ├── data_engineering.html
│       └── data_warehousing.html
├── synapse/views/               # Synapse-specific admin/DE/DW/DI views
└── views/                       # Generic fallbacks (Synapse)
```

### Inheritance Pattern

Every view extends `base.html`:

```jinja
{% extends "base.html" %}
{% block content %}  ... main HTML ...  {% endblock %}
{% block scripts %}  ... page-specific JS ...  {% endblock %}
```

Template resolution in `_generate_workspace_report()` prefers
`<platform>/workspace.html`, then falls back to root `workspace.html`
via `_template_exists()`.

## JSON Unwrapping Convention (Critical)

Every exported resource JSON wraps the typed payload in a `{kind}_data`
key. Aggregators must unwrap with fallbacks:

```python
nb_data = nb.get("notebook_data") or nb.get("data") or nb
cl_data = cl.get("cluster_data")  or cl.get("data") or cl
job_data = job.get("job_data")    or job.get("data") or job
```

Currently used keys (Databricks): `notebook_data`, `cluster_data`,
`job_data`, `warehouse_data`, `pipeline_data`, `repo_data`,
`experiment_data`, `endpoint_data`, `alert_data`, `space_data`,
`catalog_data`, `schema_data`, `table_data`, `volume_data`,
`function_data`, `policy_data`, `pool_data`.

**Templates follow the same pattern.** If you render `{{ item.name }}`
directly on the wrapped dict, you'll get nothing — unwrap first in the
aggregator or in the template with `{% set x = item.job_data or item %}`.

### Job-specific flattening

In `_aggregate_data_engineering()` Databricks branch, jobs need two
extra fixups after unwrapping:

1. Promote `settings.name` → top-level `name` (so tables show the real
   job name).
2. Flatten `tasks.tasks` → `tasks` (so `|length` returns the task
   count, not 1).

Mirror this in any template that reads jobs outside of the aggregator.

### Notebook language resolution order

```
json_response.language  →  language  →  default_language  →  "Unknown"
```

`json_response.language` is where the real value lives for Databricks;
`language`/`default_language` are Synapse naming.

## Workspace Filtering (Cross-workspace views)

All table rows that should be filterable by the navbar workspace picker
must have `data-workspace="{{ ws_name }}"`:

```jinja
{% for nb in de.notebooks %}
<tr data-workspace="{{ nb.workspace }}">...</tr>
{% endfor %}
```

`base.html` handles the filtering JS (localStorage key
`fat-workspace-filter`). Each view that also updates summary cards
should implement:

```javascript
function updateFilteredStats(selectedWorkspaces) {
    // Recompute counts from visible [data-workspace] rows
}
```

This is called automatically from `base.html` on selection changes.

## Charts (Chart.js)

- Chart.js 4.4.1 is loaded from CDN in `base.html`. No package install
  needed.
- Each chart uses an inline `<canvas id="uniqueId">` element.
- For mixed-cardinality datasets (Databricks: 5 catalogs vs 248 tables)
  use a **logarithmic y-axis**:
  ```javascript
  options: { scales: { y: { type: 'logarithmic' } } }
  ```
- The "Resource Summary" on Databricks overview uses a two-row layout:
  full-width chart, full-width table below. Avoid placing large charts
  side-by-side — they compress to illegibility on narrow screens.

## Custom Jinja Filters

Registered in `VisualizationService.__init__`:

| Filter          | Purpose                                   |
|-----------------|-------------------------------------------|
| `format_number` | Adds thousands separators (`1,234`)       |
| `format_size`   | Human-readable bytes (`1.2 MB`, `3.4 KB`) |

For platform-specific conversions (e.g. ms → seconds on job duration)
use inline `{{ '%.1f' | format(ms / 1000) }} s` — no dedicated filter.

## Adding a New Visualization View

1. Create template in `templates/<platform>/views/<new_view>.html`
   extending `base.html`.
2. Implement `_aggregate_<new_view>()` in
   `visualization_service.py`; remember to unwrap every resource with
   the `{kind}_data` fallback.
3. Add `_generate_<new_view>_view()` that reads the aggregation and
   calls `template.render(...)`.
4. Call it from `_generate_<platform>_report()`.
5. Add a nav link in `base.html` under the appropriate `{% if platform
   == 'databricks' %}` / `'synapse'` guard.
6. Implement `updateFilteredStats(selectedWorkspaces)` in `{% block
   scripts %}` if the view has aggregate tiles.

## Adding a New Resource Type to the Overview / Workspace View

Three separate places:

1. **Summary counts**: extend `_add_<platform>_counts()` with
   `summary["total_<kind>"] += counts.get("<kind>", 0)` (use
   `setdefault` if the field is new to the platform).
2. **Overview chart**: update the Databricks resource-summary chart in
   `databricks/index.html` (labels + data arrays).
3. **Workspace detail card**: add a new card/table in
   `<platform>/workspace.html`. Unwrap with
   `{% set items = workspace.resources.<kind> %}` and iterate.

## Databricks-specific Detail Rendering Patterns

### Cluster split (All-Purpose vs Job Clusters)

On `databricks/workspace.html` and
`databricks/views/data_engineering.html`, the clusters list is
partitioned by `cluster_source`:

- **All-Purpose Compute** — `rejectattr('cluster_source', 'equalto', 'JOB')`.
- **Job Clusters (latest per source)** — `selectattr('cluster_source',
  'equalto', 'JOB')`, grouped by
  `cluster_name.split('-run-')[0]` (which yields `job-{job_id}`),
  keeping the entry with max `start_time`. Use the `_by_source` dict
  mutation trick because Jinja `set` is loop-local:
  ```jinja
  {% set _by_source = {} %}
  {% for c in job_clusters %}
    {% set src = (c.cluster_name or '').split('-run-')[0] %}
    {% set prev = _by_source.get(src) %}
    {% if not prev or (c.start_time or '') > (prev.start_time or '') %}
      {% set _ = _by_source.update({src: c}) %}
    {% endif %}
  {% endfor %}
  ```
  Show the `Source` column with `src` and sort by `Last Started` desc.

### Job avg duration

Populated by the client in `DatabricksJob.avg_duration_ms_last_3_runs`.
Render with guard:

```jinja
{% set _avg = job_info.avg_duration_ms_last_3_runs %}
{% if _avg is number and _avg > 0 %}
  {{ '%.1f' | format(_avg / 1000) }} s
{% else %}
  —
{% endif %}
```

Do not recompute duration in templates — the client already handles
the `run_duration` > deprecated `execution_duration` > component-sum
priority.

### Workspace type / network badges

On `databricks/index.html` use `workspace_type` (`hybrid`/`serverless`)
to pick the badge class; show `VNet` and `PE` pills when
`vnet_injected` or `uses_private_endpoints`. On the per-workspace page,
render the full network panel (including `public_network_access` and
`no_public_ip`) only when `workspace_type == 'hybrid'`.

## Common Pitfalls

- **Flat reads before unwrap** — `{{ item.name }}` on wrapped resources
  prints nothing. Always unwrap first.
- **Single-line charts on log axis** with zero values — Chart.js hides
  zeros on log scale. Either clamp to 1 or filter out.
- **Jinja `set` inside `for` loops is loop-local** — mutate outer dicts
  via `{% set _ = outer.update(...) %}` (note `dict.update` returns
  `None`, so assign to `_`).
- **Template paths in `_template_exists`** use forward slashes
  (`databricks/views/data_engineering.html`) even on Windows — Jinja's
  loader normalizes them.
- **`generated_at` is serialized in the outer `data`** — don't try to
  pull it from each workspace.
- **`base_path`** is `""` for the overview and `"../"` for workspace
  detail pages. Always use it for asset/link relative paths.
