# Fabric Lakehouse Copy / Move

Copy or move selected content between Microsoft Fabric Lakehouses, including Lakehouses in different workspaces.

The utility supports:

- Native Delta tables
- Ordinary content under `Files/`
- OneLake shortcuts
- Spark views

A move is deliberately split into copy, validation, and separately confirmed source deletion. The utility never deletes the source or target Lakehouse item itself.

## Files

- `fabric_lakehouse_copy_move_all.ipynb` — self-contained Fabric notebook and the recommended entry point.
- `lakehouse_copy_move.py` — reusable implementation module for integration into another Fabric notebook.

The Python file is not a local command-line application. It requires a Microsoft Fabric Spark runtime, an active Spark session, and `notebookutils.mssparkutils`.

## Prerequisites

1. Access to both the source and target Fabric workspaces and Lakehouses.
2. Permission to read the selected source content and write the corresponding target content.
3. Permission to list, create, replace, or delete shortcuts when migrating shortcuts.
4. A Microsoft Fabric notebook running in a Spark session.
5. The workspace and Lakehouse UUIDs for both endpoints. Display names are not accepted.

You can obtain IDs from a Fabric URL. A URL containing:

```text
https://app.fabric.microsoft.com/groups/<workspace-id>/lakehouses/<lakehouse-id>
```

provides the values for `*_workspace_id` and `*_lakehouse_id`.

## Import the notebook

1. Open the target Fabric workspace.
2. Create or import a notebook.
3. Upload `fabric_lakehouse_copy_move_all.ipynb`.
4. For each phase, attach the Lakehouse specified below before running the notebook.
5. Edit only the parameter cell near the top of the notebook.

The notebook contains the full implementation, so `lakehouse_copy_move.py` does not need to be uploaded when using the supplied notebook.

## Important operating rules

- Begin every phase with `dry_run = True`.
- Review the returned result before changing `dry_run` to `False`.
- Use `operation = "copy"` unless source content must be deleted after successful validation.
- Preserve the full `manifestRoot` returned by the applied copy phase. It is required by later phases.
- Do not edit `manifest.json` manually.
- Use `conflict = "overwrite"` only when replacing target content is intentional.
- Table data is copied as an independent current-state Delta table at the captured source version. Delta transaction history is not copied.

## Three-phase workflow

### 1. Copy with the source Lakehouse attached

Attach the **source Lakehouse** to the notebook and set:

```python
phase = "copy"
operation = "copy"  # Use "move" only when source deletion is intended later.

source_workspace_id = "11111111-1111-1111-1111-111111111111"
source_lakehouse_id = "22222222-2222-2222-2222-222222222222"
target_workspace_id = "33333333-3333-3333-3333-333333333333"
target_lakehouse_id = "44444444-4444-4444-4444-444444444444"

manifest_root = ""
include_items = "all"
exclude_items = ""
include_patterns = ""
exclude_patterns = ""
include_table_data = True
conflict = "error"
remap_internal_shortcuts = True
dry_run = True
```

Run the notebook. The dry run inventories content and returns the planned manifest without copying or writing the manifest.

After reviewing the result, set:

```python
dry_run = False
```

Run it again to perform the copy. Save the full `manifestRoot` value returned in the result. With an empty `manifest_root`, it normally resolves to an ABFSS path similar to:

```text
abfss://<source-workspace-id>@onelake.dfs.fabric.microsoft.com/<source-lakehouse-id>/Files/lakehouse-copy-move
```

The manifest is stored on the source side so it remains accessible while the target Lakehouse is attached.

### 2. Finalize and validate with the target Lakehouse attached

Detach the source Lakehouse and attach the **target Lakehouse**. Set:

```python
phase = "finalize"
manifest_root = "abfss://..."  # Exact manifestRoot returned by copy.
dry_run = True
```

Run the notebook to preview finalization. The current implementation may create missing target schemas with `CREATE SCHEMA IF NOT EXISTS` during this dry run, but it does not create tables or views, perform validation, or update the manifest. Then set `dry_run = False` and run it again.

Applied finalization:

- Creates required schemas.
- Creates empty table definitions when `include_table_data = False` was selected.
- Creates or replaces selected views.
- Confirms copied tables exist.
- Compares source and target table row counts at the captured Delta version.
- Checks table partition columns.
- Checks that copied files/directories exist and validates file sizes.
- Checks that selected shortcuts and views exist.
- Marks the manifest as validated.

For `operation = "copy"`, the workflow is complete after successful finalization.

### 3. Delete selected source content for a move

This phase is available only if the original copy used:

```python
operation = "move"
```

It also requires a successfully validated manifest from phase 2.

Attach the **source Lakehouse** again and first preview deletion:

```python
phase = "delete-source"
manifest_root = "abfss://..."  # Same full manifestRoot.
delete_confirmation = "DELETE-SOURCE-22222222-2222-2222-2222-222222222222"
dry_run = True
```

The confirmation must be exactly:

```text
DELETE-SOURCE-<source-lakehouse-id>
```

Review the returned lists carefully. To delete the selected source objects, set:

```python
dry_run = False
```

and run the notebook again.

Deletion applies only to source objects recorded as copied in the validated manifest. It drops selected views, deletes selected shortcuts, drops copied tables, and removes copied `Files/` content. It does not delete the Lakehouse itself.

## Selection parameters

List parameters accept any of the following forms:

```python
include_items = "tables,files"
include_items = '["tables", "files"]'
include_items = ["tables", "files"]
```

This makes the notebook usable interactively or from a Fabric pipeline.

### `include_items` and `exclude_items`

Supported values are:

- `tables`
- `files`
- `shortcuts`
- `views`
- `all`

Examples:

```python
include_items = "tables,files"
exclude_items = ""
```

```python
include_items = "all"
exclude_items = "shortcuts,views"
```

At least one item type must remain after exclusions.

### Name patterns

`include_patterns` and `exclude_patterns` use case-insensitive shell-style wildcards such as `*` and `?`.

Table and view names use `schema.name`:

```python
include_patterns = "dbo.*"
exclude_patterns = "dbo.temp_*"
```

Files use paths beginning with `Files/`:

```python
include_patterns = "Files/reference/*,Files/inbound/*.csv"
exclude_patterns = "Files/archive/*"
```

Shortcut matching uses the shortcut path and name. If pattern filtering is required across multiple item types, supply patterns that cover each desired naming form.

### `include_table_data`

- `True` copies the selected Delta table data.
- `False` creates empty target table definitions during finalization.

A move that includes tables requires `include_table_data = True`; the utility rejects an empty-definition table move.

### `conflict`

- `error` — stop if target content already exists. This is the safest default.
- `skip` — leave existing target content unchanged.
- `overwrite` — replace existing selected target content.

Conflict handling applies during the copy phase. Be especially careful with `overwrite`, which can remove existing target paths or shortcuts before recreating them.

### `remap_internal_shortcuts`

When `True`, a OneLake shortcut that points back to the source Lakehouse is rewritten to point to the target Lakehouse. Shortcuts to other items retain their original targets.

Set it to `False` if internal shortcuts should continue pointing to the source Lakehouse.

### `manifest_root`

During `copy`, this can be:

- Empty, which defaults to `Files/lakehouse-copy-move` in the source Lakehouse.
- A relative source path under `Files/`.
- A full `abfss://` path.

During `finalize` and `delete-source`, it must be the full `abfss://` path returned by the applied copy phase.

Use a distinct manifest directory for separate or concurrent migrations to avoid replacing another migration's manifest. For example:

```python
manifest_root = "Files/lakehouse-copy-move/customer-migration-2026-08-03"
```

## Common examples

### Copy all supported content

```python
phase = "copy"
operation = "copy"
include_items = "all"
include_patterns = ""
exclude_patterns = ""
include_table_data = True
conflict = "error"
dry_run = True
```

### Copy only selected tables

```python
phase = "copy"
operation = "copy"
include_items = "tables"
include_patterns = "sales.*,dbo.dim_*"
exclude_patterns = "sales.staging_*"
include_table_data = True
conflict = "error"
dry_run = True
```

### Copy only a Files subtree

```python
phase = "copy"
operation = "copy"
include_items = "files"
include_patterns = "Files/reference/*"
exclude_patterns = "Files/reference/archive/*"
conflict = "error"
dry_run = True
```

### Create empty table definitions

```python
phase = "copy"
operation = "copy"
include_items = "tables"
include_table_data = False
conflict = "error"
dry_run = True
```

The table DDL is saved with the manifest during copy and applied with the target attached during finalization.

## Using the Python module

`lakehouse_copy_move.py` exposes the implementation functions:

- `copy_phase(...)`
- `finalize_phase(...)`
- `delete_source_phase(...)`
- `Endpoint`

It can be uploaded to a Fabric environment and imported from another notebook, but it does not parse command-line arguments or run a phase automatically. The supplied notebook is preferable unless embedding the functions into an existing notebook or pipeline-oriented wrapper.

Conceptual use in a Fabric notebook:

```python
from lakehouse_copy_move import Endpoint, copy_phase

result = copy_phase(
    operation="copy",
    source=Endpoint(SOURCE_WORKSPACE_ID, SOURCE_LAKEHOUSE_ID),
    target=Endpoint(TARGET_WORKSPACE_ID, TARGET_LAKEHOUSE_ID),
    manifest_root=MANIFEST_ABFSS_PATH,
    include_items=["tables", "files"],
    conflict="error",
    dry_run=True,
)
display(result)
```

The caller is responsible for configuring logging, validating input values, resolving the manifest path, switching attached Lakehouses between phases, and rerunning with `dry_run=False`. The complete notebook already handles these concerns.

## Troubleshooting

### `Run this utility in a Microsoft Fabric Spark runtime`

The code is running outside Fabric or `notebookutils` is unavailable. Run the notebook in a Fabric Spark session.

### `No active SparkSession was found`

Start or reconnect the Fabric notebook Spark session and rerun the notebook.

### `Missing copy parameters`

Provide all four source/target workspace and Lakehouse UUIDs during the copy phase.

### `Manifest is not ready for finalization`

Run the copy phase with `dry_run = False`. A dry run returns a plan but does not write `manifest.json` or mark it as copied.

### Manifest path errors during finalize or delete

Use the exact full `manifestRoot` returned by copy, including the `abfss://` prefix. A relative `Files/...` path is accepted only during copy.

### HTTP 401 or 403 errors

The notebook identity lacks access to a workspace, Lakehouse, or shortcut API operation. Confirm the signed-in Fabric user has the required permissions on both workspaces and items.

### Target already exists

The default `conflict = "error"` prevents accidental replacement. Inspect the target and then intentionally choose `skip` or `overwrite` if appropriate.

### Row-count or partition mismatch during finalization

The target does not match the captured source Delta version. Do not proceed to source deletion. Resolve the discrepancy and repeat copy/finalization as appropriate.

### Source deletion is rejected

Confirm all of the following:

- The original operation was `move`.
- Finalization completed with `dry_run = False`.
- The manifest is marked validated.
- The source Lakehouse is attached.
- `delete_confirmation` exactly matches `DELETE-SOURCE-<source-lakehouse-id>`.

## Safety notes

- Keep `dry_run = True` until every returned selection has been reviewed.
- Treat `overwrite` and the applied `delete-source` phase as destructive operations.
- Back up business-critical data independently before a move.
- Do not delete source content unless finalization completed successfully.
- Retain the migration manifest for audit and troubleshooting purposes.
