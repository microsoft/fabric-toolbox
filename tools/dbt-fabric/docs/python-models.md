# Python models

The dbt-fabric adapter supports [Python models](https://docs.getdbt.com/docs/build/python-models), allowing you to use PySpark DataFrames to transform data in Microsoft Fabric.

Python models are useful when you need transformations that are difficult or impossible to express in SQL, such as machine learning inference, complex string parsing, or calling external APIs.

!!! info "Data Warehouse vs Lakehouse"

    Python models work on both adapter types, but the execution model differs:

    - **`type: fabric` (Data Warehouse):** Python models use Livy to execute PySpark code that reads from and writes to the Data Warehouse via the [synapsesql connector](https://learn.microsoft.com/fabric/data-engineering/spark-data-warehouse-connector). You need both a [`lakehouse`](configuration.md#lakehouse) (for the Livy session) and a [`database`](configuration.md#database) (the DW target).
    - **`type: fabricspark` (Lakehouse):** Python models run on the same Livy session that handles all SQL models. The [`database`](configuration.md#database) field IS the lakehouse. No separate `lakehouse` config is needed.

    The rest of this page describes the Data Warehouse workflow. For Lakehouse-specific details, see the [Lakehouse guide](lakehouse.md).

---

## Prerequisites

To use Python models, your `profiles.yml` must include the following additional configuration options on top of the standard connection settings:

| Option | Description |
| --- | --- |
| [`workspace`](configuration.md#workspace_name) or [`workspace_id`](configuration.md#workspace_id) | Identifies your Fabric Workspace. Required so the adapter can locate the Livy API endpoint. |
| [`lakehouse`](configuration.md#lakehouse) | Identifies the Lakehouse where Spark sessions run. A Lakehouse must exist in your workspace. |

!!! warning "Tenant ID required for service principal auth"

    If you are using [`ActiveDirectoryServicePrincipal`](configuration.md#activedirectoryserviceprincipal) authentication, you must also provide the [`tenant_id`](configuration.md#tenant_id) option.

### Example profile

```yaml
default:
  target: dev
  outputs:
    dev:
      type: fabric
      workspace: My Workspace
      database: my_data_warehouse
      schema: dbt
      lakehouse: My Lakehouse
      authentication: CLI
```

---

## Writing a Python model

A Python model is a `.py` file in your `models/` directory that defines a `model()` function. This function receives a `dbt` object and a `spark` session, and must return a PySpark DataFrame.

```python
def model(dbt, spark):
    source_df = dbt.ref("my_upstream_model")

    result_df = source_df.withColumn("full_name", 
        spark.sql("concat(first_name, ' ', last_name)")
    )

    return result_df
```

### The `dbt` object

The `dbt` object provides the same interface as in other adapters:

- **`dbt.ref("model_name")`** — Returns a PySpark DataFrame for the referenced model.
- **`dbt.source("source_name", "table_name")`** — Returns a PySpark DataFrame for the referenced source.
- **`dbt.config.get("key")`** — Access the model's configuration.

### The `spark` object

The `spark` object is a standard PySpark `SparkSession`. Behind the scenes, the adapter configures it with Fabric's [synapsesql connector](https://learn.microsoft.com/fabric/data-engineering/spark-data-warehouse-connector) so that `dbt.ref()` and `dbt.source()` read directly from your Data Warehouse.

---

## How it works

Understanding the execution flow can help with debugging:

1. **Code generation** — dbt compiles your Python model and wraps it with boilerplate that configures the Spark session and sets up the `synapsesql` connector for reads and writes.
2. **Livy session** — The adapter connects to the [Livy API](https://learn.microsoft.com/fabric/data-engineering/lakehouse-api) on your Lakehouse and either reuses an existing Spark session named `dbt-fabric` or creates a new one.
3. **Statement execution** — The compiled code is submitted as a PySpark statement to the Livy session.
4. **Write back** — The returned DataFrame is written to your Data Warehouse using `synapsesql` in `overwrite` mode.

All Python models in a single dbt run share the same Livy session, which avoids the overhead of starting a new Spark session for each model.

---

## Limitations

| Limitation | Details |
| --- | --- |
| **Table materialization only** | Python models only support the `table` materialization. Incremental models are not supported. |
| **PySpark DataFrames only** | Your `model()` function must return a PySpark DataFrame. Pandas DataFrames are not supported. |
| **Always full refresh** | The table is fully replaced (`overwrite` mode) on each run. |
| **Session timeout** | The adapter polls for session and statement completion with a timeout of approximately 5 minutes. Long-running Spark jobs may hit this limit. |

---

## Troubleshooting

### Common issues

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `workspace_id must be provided` | Missing workspace configuration | Add [`workspace`](configuration.md#workspace_name) or [`workspace_id`](configuration.md#workspace_id) to your profile |
| `lakehouse must be provided` | Missing lakehouse configuration | Add [`lakehouse`](configuration.md#lakehouse) to your profile |
| Livy session times out | The Spark session took too long to start | Retry — Fabric Spark sessions can be slow to start on first use |
| Statement fails with `synapsesql` error | Connection between Spark and the Data Warehouse failed | Verify that the Lakehouse and Data Warehouse are in the same workspace |
| `HTTP 429` errors in logs | Fabric API rate limiting | The adapter handles this automatically with retries — no action needed |
