# Lakehouse (Spark SQL)

The dbt-fabric adapter supports Fabric Lakehouse via the `fabricspark` adapter type. This uses **Spark SQL** as the query language and connects to Fabric through the [Livy API](https://learn.microsoft.com/fabric/data-engineering/lakehouse-api) -- an HTTP REST interface for submitting Spark statements.

---

## Getting started

### Installation

Install the adapter with the `[spark]` extra:

```bash
pip install dbt-fabric[spark] dbt-core
```

This installs [dbt-spark](https://github.com/dbt-labs/dbt-spark) as a dependency.

### Configuration

Add a FabricSpark profile to your `profiles.yml`:

```yaml
default:
  target: dev
  outputs:
    dev:
      type: fabricspark
      workspace: your workspace name
      database: name_of_your_lakehouse
      schema: dbt
```

The `workspace` (or `workspace_id`) is always required for FabricSpark -- the adapter uses it to resolve the Livy API endpoint. The `database` field is the name of your Lakehouse.

For all configuration options, see the [configuration reference](configuration.md).

### Authentication

The [authentication methods](authentication.md) documented in the authentication guide work with both adapter types. When following examples there, substitute `type: fabricspark` where the examples show `type: fabric`. Note that `ActiveDirectoryIntegrated` and `ActiveDirectoryPassword` are Data Warehouse-only methods and do not work with FabricSpark.

The FabricSpark adapter does not use the [`host`](configuration.md#host) option -- it always resolves the Livy endpoint from the workspace and lakehouse information.

---

## How it works

The FabricSpark adapter executes all SQL through Fabric's [high-concurrency Livy API](https://learn.microsoft.com/en-us/fabric/data-engineering/high-concurrency-livy). Each dbt thread gets its own REPL inside a shared underlying Livy session. Here is the execution flow:

```mermaid
sequenceDiagram
    participant dbt
    participant Adapter
    participant HC Livy API
    participant Spark Session

    dbt->>Adapter: Compiled Spark SQL
    Adapter->>HC Livy API: POST /highConcurrencySessions (acquire REPL)
    alt Underlying session exists (warm)
        HC Livy API-->>Adapter: HC session ID + REPL ID
    else No underlying session
        Note over HC Livy API,Spark Session: Spark startup
        HC Livy API-->>Adapter: HC session ID + REPL ID
    end
    Adapter->>HC Livy API: POST /highConcurrencySessions/{id}/repls/{replId}/statements
    HC Livy API->>Spark Session: Execute Spark SQL (in REPL)
    loop Poll every 3 seconds
        Adapter->>HC Livy API: GET /highConcurrencySessions/{id}/repls/{replId}/statements/{stmtId}
        HC Livy API-->>Adapter: Status + results (when done)
    end
    Adapter-->>dbt: Parsed results
```

Key technical details:

- **One REPL per thread** -- Each dbt thread acquires its own REPL inside a shared underlying Livy session. Statements from different REPLs execute in parallel.
- **Deterministic session tag** -- The adapter computes a session tag from `(workspace_id, lakehouse_id)`. Fabric packs all REPLs with the same tag onto one underlying Livy session, enabling warm session reuse across dbt invocations.
- **Polling interval** -- The adapter polls for statement completion every 3 seconds.
- **Rate limiting** -- The Fabric Livy API enforces rate limits. The adapter handles HTTP 429 responses automatically using the `Retry-After` header.
- **DB-API 2.0 cursor** -- Results are returned as JSON and parsed into a [PEP 249](https://peps.python.org/pep-0249/) compatible cursor, so dbt interacts with the Lakehouse the same way it interacts with any other database.

---

## Materializations

In addition to the standard dbt materializations, FabricSpark supports `materialized_view`, which creates Fabric [lake views](https://learn.microsoft.com/fabric/data-engineering/lakehouse-sql-analytics-endpoint). Lake views support `PARTITIONED BY`, `TBLPROPERTIES`, and `CHECK` constraints with `ON MISMATCH` behavior.

The incremental materialization supports `append` and `insert_overwrite` strategies.

---

## Identifier quoting

FabricSpark uses **backticks** (`` ` ``) for identifier quoting, following Spark SQL conventions. This is different from the Data Warehouse adapter, which uses T-SQL brackets (`[]`).

```sql
-- FabricSpark (Spark SQL)
SELECT `my column` FROM `my_schema`.`my_table`

-- Fabric Data Warehouse (T-SQL)
SELECT [my column] FROM [my_schema].[my_table]
```

---

## High-concurrency Livy

The adapter uses Fabric's [high-concurrency Livy API](https://learn.microsoft.com/en-us/fabric/data-engineering/high-concurrency-livy). Each dbt thread acquires its own HC session -- and therefore its own REPL -- inside a single underlying Livy session shared via a deterministic `sessionTag` derived from `(workspace_id, lakehouse_id)`. Statements from different REPLs execute in **parallel** inside the same Spark application, so increasing `threads` in your profile directly increases throughput.

### Session reuse across runs

The session tag is deterministic: every dbt invocation targeting the same workspace + lakehouse produces the same tag. Fabric snap-attaches new REPLs onto the still-warm underlying Livy session, skipping the Spark cold-start entirely on subsequent runs.

### `threads > 5`

Fabric packs up to **5 REPLs onto one underlying Livy session** (see the [HC Livy key concepts](https://learn.microsoft.com/en-us/fabric/data-engineering/high-concurrency-livy#key-concepts)). With `threads > 5`, dbt still works correctly -- Fabric spins up a second underlying Livy session to host the 6th REPL onwards.

| Property | Shared across underlying sessions? |
| --- | --- |
| OneLake Delta tables (dbt model outputs) | Yes -- same lakehouse storage |
| Catalog / metastore (`SELECT FROM <other_model>`) | Yes -- same Fabric catalog |
| Temp views (`CREATE TEMPORARY VIEW ...`) | No -- REPL/session-local |
| Session-level Spark configs (`SET spark.sql.X = ...`) | No |
| Cached datasets / UDFs / broadcast vars | No |

Because dbt-fabricspark materializations always write permanent Delta / lake view objects, model-to-model `ref`s resolve correctly regardless of which underlying session produced or consumes the table.

!!! note "Cost tradeoff"

    Each additional underlying Livy session is a separate Spark cluster billed for the duration of the run plus the idle timeout. Keep `threads ≤ 5` for the cheapest profile; raise it only when the extra parallelism beats the extra compute spend.

---

## Performance considerations

The Livy API architecture has inherent performance characteristics that are important to understand.

### Session startup

Creating a new Spark session takes some time. The adapter reuses sessions within a run, so this overhead is paid once per `dbt run`. Subsequent runs may reuse an existing session if it is still alive. The [high-concurrency Livy](#high-concurrency-livy) session tag is deterministic, so subsequent runs can skip startup entirely by reattaching to a warm session.

### Statement execution

Each SQL statement involves multiple HTTP API calls (submit + poll). This is inherently slower than a direct database connection like the TDS protocol used by the Data Warehouse adapter. Statements from different threads execute in parallel via [high-concurrency Livy](#high-concurrency-livy), significantly improving wall-clock time for multi-model runs.

### Polling overhead

The adapter polls for statement completion every 3 seconds. Even very fast queries take at least 3 seconds to return.

### API rate limiting

Fabric applies rate limits to the Livy API. The adapter handles HTTP 429 responses automatically by respecting the `Retry-After` header. During heavy workloads, you may see pauses of 5-30 seconds between statements.

### Practical impact

A dbt run with many models will be significantly slower on FabricSpark than on Fabric Data Warehouse. This is inherent to the Livy API architecture, not a limitation of the adapter. [High-concurrency Livy](#high-concurrency-livy) reduces this gap by running statements in parallel.

### Recommendations

- Use higher thread counts to parallelize model execution and amortize the per-statement overhead. However, higher parallelism also increases API call volume, which can trigger rate limiting sooner.
- Keep models as consolidated as possible to reduce the total number of statements.
- Monitor the Spark session in the [Fabric monitoring hub](https://learn.microsoft.com/fabric/data-engineering/spark-monitor-overview) to understand execution patterns.

---

## Differences from Fabric Data Warehouse

| Concept | Data Warehouse (`fabric`) | Lakehouse (`fabricspark`) |
| --- | --- | --- |
| SQL dialect | T-SQL | Spark SQL |
| Connection | mssql-python (TDS protocol) | Livy sessions (HTTP REST) |
| Identifier quoting | `[brackets]` | `` `backticks` `` |
| Default materialization | `table` | `view` |
| Views | Supported | Supported |
| String type | `varchar(MAX)` | `string` |
| Timestamp type | `datetime2(6)` | `timestamp` |
| Pagination | `SELECT TOP N` | `LIMIT N` |
| Catalog queries | `sys.tables`, `sys.columns` | `SHOW TABLES`, `DESCRIBE` |
| Python models | Via Livy + separate lakehouse config | Native (same Livy session) |
| MERGE incremental | Supported | Not supported |
| [CLUSTER BY](cluster-by.md) | Supported | Not supported |
| [Warehouse snapshots](warehouse-snapshots.md) | Supported | Not supported |
| [Catalog statistics](catalog-stats.md) | Supported | Not supported |

---

## Python models

Python models work differently depending on the adapter type:

- **`type: fabric` (Data Warehouse):** Python models use Livy to execute PySpark code that reads from and writes to the Data Warehouse via the [synapsesql connector](https://learn.microsoft.com/fabric/data-engineering/spark-data-warehouse-connector). You need both a [`lakehouse`](configuration.md#lakehouse) (for the Livy session) and a [`database`](configuration.md#database) (the DW target).
- **`type: fabricspark` (Lakehouse):** Python models run on the same Livy session that handles all SQL models. The [`database`](configuration.md#database) field IS the lakehouse. No separate `lakehouse` config is needed.

See the [Python models guide](python-models.md) for writing and debugging Python models.

---

## Limitations

- **No incremental merge strategy** -- the Spark SQL `MERGE` syntax in Fabric Lakehouse is not supported by the adapter. Use `append` or `insert_overwrite` instead.
- **API rate limiting** -- can slow down large runs with many models.
- **Session startup time** -- creating a new Spark session adds latency to the first statement in a run.
- **Data Warehouse-only features** -- [CLUSTER BY](cluster-by.md), [warehouse snapshots](warehouse-snapshots.md), and [catalog statistics](catalog-stats.md) are not available for Lakehouse.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Livy session did not become idle in time` | Session startup took too long | Increase [`spark_session_timeout`](configuration.md#spark_session_timeout), retry, or check Fabric capacity |
| `HTTP 429` in logs | API rate limiting | Automatic -- the adapter retries. Reduce `threads` if excessive. |
| Slow execution | Livy polling overhead | Expected behavior. Use higher thread count. |
| Statement timeout | Long-running Spark query | Increase [`query_timeout`](configuration.md#query_timeout) |
| `Either workspace_id or workspace_name must be provided` | Missing workspace configuration | Add [`workspace`](configuration.md#workspace_name) or [`workspace_id`](configuration.md#workspace_id) to your profile |
