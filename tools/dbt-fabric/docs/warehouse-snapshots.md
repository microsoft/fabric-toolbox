# Warehouse snapshots

A [warehouse snapshot](https://learn.microsoft.com/fabric/data-warehouse/warehouse-snapshot) is a read-only, point-in-time view of a Fabric Data Warehouse. Snapshots let downstream consumers (reports, analysts, other pipelines) query a stable version of the data while your dbt run is modifying the warehouse. They can be "rolled forward" on demand and are retained for up to 30 days.

The dbt-fabric adapter ships a macro that lets you create or update a warehouse snapshot from anywhere in your dbt project — giving you full control over **when** and **how often** snapshots are taken.

---

## How it's exposed

This adapter exposes warehouse-snapshot creation as a Jinja macro you call explicitly. You decide when to take a snapshot, what to name it, and how often to refresh it — using dbt's standard side-effect orchestration mechanisms (`on-run-start`, `on-run-end`, `post-hook`, or any other Jinja context). This means you can take snapshots at multiple points during a run, use dynamic names (e.g. including the date), scope them to specific models, or skip them entirely on certain invocations — all by writing standard dbt configuration.

---

## The macro

```jinja
{{ create_or_update_fabric_warehouse_snapshot(snapshot_name, description) }}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `snapshot_name` | string | yes | Display name of the snapshot in Fabric. Must be unique within the workspace. |
| `description` | string | no | Human-readable description shown in the Fabric portal. |

**Behavior:**

- If a snapshot with the given name **does not exist** yet, a new one is created at the current point in time.
- If a snapshot with the given name **already exists**, its timestamp is rolled forward to the current point in time.

This means you can safely call the macro multiple times with the same name — it will always update the snapshot to the latest state.

---

## When to use it

The macro can be called in any place where dbt allows you to run SQL or call macros:

### `on-run-start` / `on-run-end` hooks

These hooks run once at the very beginning or end of a dbt invocation (`dbt run`, `dbt build`, `dbt test`, `dbt seed`, …). This is the most common way to use warehouse snapshots.

=== "Snapshot after each run"

    Take a snapshot after all models have been built:

    ```yaml title="dbt_project.yml"
    on-run-end:
      - "{{ create_or_update_fabric_warehouse_snapshot('daily_snapshot', 'Snapshot taken after dbt run') }}"
    ```

=== "Snapshot before and after"

    Take a snapshot both before and after the run. This gives you a "before" and "after" view of the warehouse:

    ```yaml title="dbt_project.yml"
    on-run-start:
      - "{{ create_or_update_fabric_warehouse_snapshot('pre_run_snapshot', 'State before dbt run') }}"
    on-run-end:
      - "{{ create_or_update_fabric_warehouse_snapshot('post_run_snapshot', 'State after dbt run') }}"
    ```

=== "Single snapshot, refreshed twice"

    Use the same snapshot name in both hooks. The `on-run-start` hook creates it, and the `on-run-end` hook rolls it forward to the post-run state:

    ```yaml title="dbt_project.yml"
    on-run-start:
      - "{{ create_or_update_fabric_warehouse_snapshot('latest_snapshot') }}"
    on-run-end:
      - "{{ create_or_update_fabric_warehouse_snapshot('latest_snapshot') }}"
    ```

### `post-hook` on a model

A [`post-hook`](https://docs.getdbt.com/reference/resource-configs/pre-hook-post-hook) runs after a specific model is built. Use this if you want a snapshot taken at the exact point when a particular model has finished.

```sql title="models/marts/finance/revenue.sql"
{{ config(
    post_hook="{{ create_or_update_fabric_warehouse_snapshot('after_revenue', 'Taken after revenue model') }}"
) }}

select ...
```

Or apply it to an entire folder in `dbt_project.yml`:

```yaml title="dbt_project.yml"
models:
  my_project:
    marts:
      +post-hook:
        - "{{ create_or_update_fabric_warehouse_snapshot('marts_snapshot') }}"
```

!!! tip "Use `on-run-end` for most cases"

    `post-hook` runs after **each** model it applies to. If you attach it to a folder with 20 models, the snapshot will be updated 20 times. For a single snapshot per run, prefer `on-run-end`.

### Dynamic snapshot names

Since the macro is called from Jinja, you can use any Jinja expression for the snapshot name. For example, include the current date:

```yaml title="dbt_project.yml"
on-run-end:
  - "{{ create_or_update_fabric_warehouse_snapshot('snapshot_' ~ modules.datetime.datetime.now().strftime('%Y%m%d')) }}"
```

Or use an environment variable:

```yaml title="dbt_project.yml"
on-run-end:
  - "{{ create_or_update_fabric_warehouse_snapshot(env_var('SNAPSHOT_NAME', 'default_snapshot')) }}"
```

---

## Prerequisites

Warehouse snapshots use the Fabric REST API, so the same requirements as for [workspace auto-discovery](configuration.md#workspace_name) apply:

- [`workspace`](configuration.md#workspace_name) or [`workspace_id`](configuration.md#workspace_id) must be configured in your profile
- Your authentication identity must have **admin**, **member**, or **contributor** permissions on the workspace

No additional configuration options are needed beyond the standard connection settings.

---

## How it works

1. The macro calls the adapter's `create_or_update_warehouse_snapshot` method.
2. The adapter uses the Fabric REST API to either create a new snapshot or update an existing one.
3. Snapshot creation is an asynchronous operation — the adapter tracks the operation and waits up to 30 minutes for it to complete if needed (e.g. when the same snapshot is updated again later in the same run).
4. The snapshot is scoped to the Data Warehouse configured in your [`database`](configuration.md#database) option.

---

## Limitations

- **Snapshot names must be unique** within the workspace — they cannot share a name with a warehouse or SQL analytics endpoint.
