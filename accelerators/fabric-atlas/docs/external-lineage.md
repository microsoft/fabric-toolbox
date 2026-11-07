# External lineage (OpenLineage)

Since 2.7, Fabric Atlas can show what happens **outside Fabric** next to the
Fabric graph. The only exchange format is [OpenLineage](https://openlineage.io).
Atlas has no connector for any external data source:
each source writes OpenLineage, Atlas reads it. In the other direction, Atlas
writes the Fabric lineage as OpenLineage so other tools can read it.

V1 is manual: you import a file, and you download a file. Automatic ingestion
and Spark runtime events are planned after V1 (#86, #19).

## Where

- **External lineage** (sidebar) → **Imports**, **Link to Fabric**, **File format**.
- **Map & lineage** → **External lineage** switch (disabled until a file is imported)
  and **Download OpenLineage**.

## Import

1. Export OpenLineage events from the external tool (`.json` or `.ndjson`).
2. **External lineage → Import OpenLineage file**, then give the import a **name**
   (defaults to the file name without extension). The name is shown in the imports
   list and on the map; the file name is kept underneath.
3. Atlas reads the events, keeps datasets, jobs, input → output edges and
   column lineage, and stores them in the workspace (three Rayfin tables:
   `OpenLineageImport`, `ExternalDataset`, `ExternalLineageEdge`).

Accepted input:

| Point | Rule |
|---|---|
| Files | `.json` (one event, an array, or `{ "events": [...] }`) or `.ndjson` (one event per line) |
| Events | `RunEvent`, `JobEvent`, `DatasetEvent` (OpenLineage 2-0-x) |
| Kept | dataset `namespace` + `name`, job `namespace` + `name`, run state and time, `columnLineage` facet |
| Not kept | data, SQL text, credentials, any other facet |
| Limits | 20 MB per file, 50 000 events, 5 000 datasets |

A file that contains no OpenLineage event is rejected and listed with the reason.
Re-importing a file with the same file name replaces its edges and keeps its name (editable in the
dialog); manual links are kept. Deleting an
import removes its edges and the datasets no other import uses.

### Sample file

[`samples/openlineage/example-data-source.ndjson`](../samples/openlineage/example-data-source.ndjson)
holds 3 runs from a generic data source (`source://erp-prod/sales`) reading Oracle and
PostgreSQL tables and writing to a OneLake lakehouse (`Sales-Analytics` workspace,
`lh_sales` lakehouse). Import it as is to try manual linking, or replace the workspace and
lakehouse names with yours so the OneLake outputs link automatically.

[`samples/openlineage/example-crm-iot-sources.ndjson`](../samples/openlineage/example-crm-iot-sources.ndjson)
holds 5 Airflow runs with other sources: Salesforce, PostgreSQL, Kafka (streaming)
and S3. Its OneLake outputs target items of the `FGI-MAIN` workspace
(`alpinerent_lakehouse`, `LH_Healthcare_Clinical`, `HealthcareTelemetryStream`) and link
automatically there; the `source://partner-hub` datasets stay **To link**.

## Link to Fabric

The link point is the dataset that exists on both sides.

- **Automatic (exact path)** — a dataset whose namespace is the OneLake host of
  the current workspace (`abfss://<workspace name or id>@onelake.dfs.fabric.microsoft.com`)
  and whose name is an item path (`<item>[.<Type>]/Tables/<schema>/<table>`,
  `<item>[.<Type>]/Files/...` or `<item>.<Type>`) is linked to that item.
  Names and GUIDs are both accepted; nothing is guessed.
- **Manual** — every other dataset is **To link**. An administrator picks any
  Fabric item of the workspace (data stores are listed first; search matches the
  name or the type, for example `eventstream`) or a known table, or marks it
  **External** (stays outside Fabric).

## Map and impact

With the **External lineage** switch on, external datasets and jobs appear in an
"External · OpenLineage" lane. A linked dataset is drawn on the Fabric item it
points to. Impact analysis follows the edges across the boundary: a Fabric
report shows its external upstream, an external job shows the Fabric items it
feeds.

## Download (export)

**Download OpenLineage** (External lineage header or Map toolbar) writes an
NDJSON file in the browser — no network call.

| Option | Effect |
|---|---|
| Current workspace | every item and edge of the snapshot |
| Selection on the map | selected item(s) and their direct neighbours |
| Include linked external datasets | adds imported edges that touch a linked Fabric item, with column lineage |

Content:

- One **JobEvent** per Fabric job item (Notebook, Data pipeline, Dataflow,
  Eventstream, User data function): inputs → job → outputs, `jobType` facet with
  `integration = FABRIC` and, per item type, `NOTEBOOK`/`BATCH`, `DAG`/`BATCH`
  (pipeline), `DATAFLOW`/`BATCH`, `EVENTSTREAM`/`STREAMING`, `FUNCTION`/`SERVICE`,
  plus `documentation` / `ownership` facets when known.
- Notebooks are exported at **table level** when Atlas parsed their code
  (`spark.read.table`, `saveAsTable`, Spark SQL…): `lh.Lakehouse/Tables/bronze/orders`
  → notebook → `lh.Lakehouse/Tables/silver/orders`. Otherwise the job keeps the
  item-level lakehouse, which can appear as both input and output.
- One **JobEvent** per group of direct item → item edges (for example Warehouse →
  Semantic model), named `<target>.<Type>#<relation>`.
- One **DatasetEvent** per dataset item or table in scope, including items with
  no edge (they are catalog entries, so they show as unconnected nodes). Facets:
  `documentation` (description), `ownership` (owner) and `schema` (columns, for
  tables whose schema was scanned), `datasetType` `MODEL` for Semantic models
  (`SEMANTIC_MODEL`), Graph models (`GRAPH`) and Ontologies (`ONTOLOGY`); containers
  (Lakehouse, Warehouse…) carry no generic type. `eventTime` is the item's last update when
  known, the export time otherwise.
- Fabric datasets use the OneLake namespace and names above, so importing the
  file back links 100 % of them by exact path.
- Every Fabric job and dataset carries the custom facet `fabricAtlas_item`
  (`platform = MICROSOFT_FABRIC`, `itemType`, `itemId`, `workspaceId`), so consumers
  read the exact Fabric type without parsing the name suffix. Schema:
  [`docs/openlineage/FabricAtlasItemFacet.json`](openlineage/FabricAtlasItemFacet.json).
- `producer = https://github.com/fredgis/FabricAtlas/v2.7`, official
  OpenLineage `schemaURL`. Only item, table and job names are written.
