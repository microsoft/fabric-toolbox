# Fabric metadata coverage audit

**As of:** 2026-09-05
**Scope:** Current, public, first-party Microsoft documentation and APIs, plus the
operator-supplied FGI-MAIN observations below. This audit does not rely on
application source code and does not include business-data rows.

## Executive assessment

Fabric Atlas can add useful metadata coverage for all four areas, but the safe
integration path differs by workload:

- **Eventhouse/KQL Database:** strong support. Discover items through Fabric
  REST, then use read-only Kusto management commands for tables, columns,
  functions, materialized views, and selected policies. This avoids the
  write-capable permission required by `getDefinition`.
- **Fabric SQL Database (OLTP):** strong support. The item API returns the OLTP
  TDS address and database name. Standard `sys.*` catalog views can provide
  schema metadata with `VIEW DEFINITION`, without granting permission to read
  business rows. Do not confuse this endpoint with the separate SQL analytics
  endpoint.
- **Fabric IQ Ontology/GraphModel:** useful but preview and permission-sensitive.
  Public definitions expose type systems, bindings, contextualizations, and
  graph mappings. The separate GQL query API can enumerate graph instances and
  therefore crosses Atlas's metadata-only boundary.
- **Fabric Data Agent:** the item and definition management APIs are public and
  the product is GA. Definition files reveal configured source artifacts and
  selected schema elements, but also contain AI instructions and few-shot
  queries that Atlas should discard. There is no direct chat operation in the
  Fabric DataAgent REST operation group; programmatic Q&A is available through
  first-party Foundry integration, currently using a preview Fabric tool, and
  returns business answers rather than catalog metadata.

The central security constraint is confirmed across the public APIs:
`getDefinition` requires **read and write permission on the item** and
`Item.ReadWrite.All` for Ontology, GraphModel, and DataAgent. KQL Database and
SQL Database also accept their type-specific `*.ReadWrite.All` scopes. Atlas's
documented `Item.Read.All` scope is therefore insufficient for these definition
calls. The recommended design is not to broaden the default crawler token:
prefer schema-native read-only access for KQL and SQL, and place preview
definition ingestion behind a separately consented, tightly allowlisted
connector.

## Live tenant evidence supplied for this audit

The following observations are evidence that the documented surfaces work in
FGI-MAIN; they are not a substitute for Microsoft API contracts.

| Item or check | Observed result |
|---|---|
| Workspace inventory | 5 `KQLDatabase`, 4 `SQLDatabase`, 1 `Ontology`, 1 `GraphModel`, 1 `DataAgent` |
| KQL metadata | Read-only checks succeeded; 7 tables, 56 columns, and 6 functions across nonempty databases |
| SQL metadata | Read-only `sys.*` checks succeeded; 36 tables, 455 columns, and 4 views across four databases |
| Ontology definition | 12 entity types, 95 properties including time-series properties, 16 source bindings, 14 relationship types, and 14 contextualizations |
| GraphModel definition | 12 node types, 14 edge types, and source mappings; no instance graph was read |
| DataAgent definition | Draft and published configurations for a semantic model, KQL source, and ontology, with selected element trees |

No raw business rows or graph instances are included in this report.

## 1. Eventhouse and KQL Database

### Supported discovery surfaces

The type-specific list operations are:

```http
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/eventhouses
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/kqlDatabases
```

Both list APIs require a Viewer workspace role and
`Workspace.Read.All` or `Workspace.ReadWrite.All`. Per-item reads use:

```http
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/eventhouses/{eventhouseId}
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/kqlDatabases/{kqlDatabaseId}
```

The per-item endpoints accept `Item.Read.All` or the corresponding
type-specific read scope. Eventhouse properties include `queryServiceUri`,
`ingestionServiceUri`, and `databasesItemIds`; KQL Database properties include
`parentEventhouseItemId`, both service URIs, and `databaseType`.
([List Eventhouses](https://learn.microsoft.com/en-us/rest/api/fabric/eventhouse/items/list-eventhouses),
[Get Eventhouse](https://learn.microsoft.com/en-us/rest/api/fabric/eventhouse/items/get-eventhouse),
[List KQL Databases](https://learn.microsoft.com/en-us/rest/api/fabric/kqldatabase/items/list-kql-databases),
[Get KQL Database](https://learn.microsoft.com/en-us/rest/api/fabric/kqldatabase/items/get-kql-database))

### Definition API

```http
POST https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/kqlDatabases/{kqlDatabaseId}/getDefinition
```

This long-running API requires read-write item permission and
`KQLDatabase.ReadWrite.All` or `Item.ReadWrite.All`. It returns Base64 parts
including `DatabaseProperties.json`, `DatabaseSchema.kql`, and `.platform`.
Microsoft describes `DatabaseSchema.kql` as a KQL script defining tables,
functions, materialized views, and more. The definition format currently
supports `ReadWrite` databases; behavior for shortcut/follower `ReadOnly`
databases should be treated as unsupported until documented or tested.
([Get KQL Database Definition](https://learn.microsoft.com/en-us/rest/api/fabric/kqldatabase/items/get-kql-database-definition),
[KQL Database definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/kql-database-definition))

### Preferred read-only schema mechanism

Use the returned `queryServiceUri` as the Kusto service endpoint and send
control commands to the management route, not the query route:

```http
POST {queryServiceUri}/v1/rest/mgmt
Authorization: Bearer <Kusto access token>
Content-Type: application/json; charset=utf-8
x-ms-readonly: true

{
  "db": "<database-name>",
  "csl": ".show database <database-name> schema as json with(Tables=True, Functions=True, MaterializedViews=True)"
}
```

Kusto documents `/v1/rest/mgmt` for management commands and the
`x-ms-readonly` header for preventing requests from changing data. Kusto client
libraries support user identities, service principals, and managed identities;
the identity must also hold an appropriate Kusto database role.
([Kusto query/management HTTP request](https://learn.microsoft.com/en-us/kusto/api/rest/request?view=microsoft-fabric),
[Kusto authentication methods](https://learn.microsoft.com/en-us/kusto/api/get-started/app-authentication-methods?view=microsoft-fabric))

Recommended allowlisted commands:

| Metadata | Read-only command | Documented minimum role |
|---|---|---|
| Tables and columns | `.show database <db> schema as json` | Database User, Viewer, or Monitor |
| Functions | Include `Functions=True` in the schema command; use function show commands only if bodies are required | Database User, Viewer, or Monitor |
| Materialized views | Include `MaterializedViews=True`, or `.show materialized-views` | Database User, Viewer, or Monitor |
| Retention policy | `.show table <table> policy retention` | Database User, Viewer, or Monitor |
| Update policy | `.show table <table> policy update` | Database User, Viewer, or Monitor |
| Row-level security policy | `.show table <table> policy row_level_security` | Database User, Viewer, or Monitor |
| Restricted-view policy | `.show table * policy restricted_view_access` | Database User, Viewer, or Monitor |

Sources:
[database schema](https://learn.microsoft.com/en-us/kusto/management/show-schema-database?view=microsoft-fabric),
[tables](https://learn.microsoft.com/en-us/kusto/management/show-tables-command?view=microsoft-fabric),
[materialized views](https://learn.microsoft.com/en-us/kusto/management/materialized-views/materialized-view-show-command?view=microsoft-fabric),
[retention](https://learn.microsoft.com/en-us/kusto/management/show-table-retention-policy-command?view=microsoft-fabric),
[update policy](https://learn.microsoft.com/en-us/kusto/management/show-table-update-policy-command?view=microsoft-fabric),
[row-level security](https://learn.microsoft.com/en-us/kusto/management/show-table-row-level-security-policy-command?view=microsoft-fabric),
[restricted-view access](https://learn.microsoft.com/en-us/kusto/management/show-table-restricted-view-access-policy-command?view=microsoft-fabric),
[Kusto roles](https://learn.microsoft.com/en-us/kusto/management/security-roles?view=microsoft-fabric).
Kusto documents additional policy families, but Atlas should add them only
through an explicit command allowlist.
([Policies overview](https://learn.microsoft.com/en-us/kusto/management/policies?view=microsoft-fabric))

**Boundary:** function bodies, materialized-view queries, update-policy queries,
RLS expressions, and documentation strings are metadata/code rather than rows,
but can contain literals or business logic. Store them only if Atlas explicitly
classifies source expressions as catalog metadata; otherwise retain names,
types, dependencies, and policy presence while dropping bodies and literals.

### Scanner and lineage

Microsoft Purview's Fabric inventory explicitly lists KQL Database, and states
that non-Power BI Fabric items have item-level metadata and lineage only.
Sub-item metadata is documented for Power BI semantic models and, in preview,
Lakehouse tables/files; sub-item lineage remains unsupported. Therefore KQL
table/column/function lineage must not be inferred from scanner results.
([Fabric metadata scanning](https://learn.microsoft.com/en-us/fabric/governance/metadata-scanning-overview),
[Fabric lineage in Purview](https://learn.microsoft.com/en-us/purview/data-map-lineage-fabric))

## 2. Fabric SQL Database (OLTP)

### Item metadata and endpoint distinction

```http
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/sqlDatabases/{sqlDatabaseId}
```

The endpoint requires read permission and accepts `SQLDatabase.Read.All` or
`Item.Read.All`. Its properties include `connectionString`, `databaseName`,
`serverFqdn`, restore points, retention days, and collation.
([Get SQL Database](https://learn.microsoft.com/en-us/rest/api/fabric/sqldatabase/items/get-sql-database))

This is the OLTP SQL Database TDS endpoint. It is distinct from the SQL
analytics endpoint automatically associated with the item. Microsoft documents
the OLTP endpoint as Azure-SQL-like and shows
`*.database.fabric.microsoft.com,1433` in current examples, while the analytics
endpoint uses a `*.fabric.microsoft.com` warehouse-style address. The same
connection article also contains an older `*.database.windows.net` description,
so Atlas should trust `serverFqdn`/`connectionString` returned by the REST API
rather than construct a hostname.
([Connect to SQL Database in Fabric](https://learn.microsoft.com/en-us/fabric/database/sql/connect))

The type-specific list route
`GET /v1/workspaces/{workspaceId}/sqlDatabases` requires a Viewer workspace role
and `Workspace.Read.All` or `Workspace.ReadWrite.All`.
([List SQL Databases](https://learn.microsoft.com/en-us/rest/api/fabric/sqldatabase/items/list-sql-databases))

### Preferred read-only catalog mechanism

Connect over TDS with Microsoft Entra authentication and query standard catalog
views such as `sys.schemas`, `sys.tables`, `sys.columns`, `sys.types`,
`sys.views`, `sys.indexes`, `sys.foreign_keys`, and `sys.objects`.
SQL Database in Fabric supports the Azure SQL Database catalog-view surface.
([SQL Database catalog views](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/azure-sql-database-catalog-views?view=fabric-sqldb),
[Connect to SQL Database in Fabric](https://learn.microsoft.com/en-us/fabric/database/sql/connect))

For a strict metadata-only principal:

1. Grant Fabric **Read** so the identity can connect.
2. Grant SQL `VIEW DEFINITION` at database scope, or narrower object/schema
   permissions, so catalog rows are visible.
3. Do not grant `ReadData`, `SELECT`, or `db_datareader` solely for cataloging.

Fabric documents that item `Read` permits connection while `ReadData` permits
reading data and metadata. SQL metadata visibility is limited to securables the
principal owns or can access; `VIEW DEFINITION` expands metadata visibility
without itself granting row reads.
([SQL Database authorization](https://learn.microsoft.com/en-us/fabric/database/sql/authorization),
[SQL metadata visibility](https://learn.microsoft.com/en-us/sql/relational-databases/security/metadata-visibility-configuration?view=fabric-sqldb))

Avoid collecting `sys.sql_modules.definition`, computed/default/check
expressions, or shared query text unless Atlas deliberately catalogs source
code. These fields can contain literals even though they are not result rows.

### Definition API

```http
POST https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/sqlDatabases/{sqlDatabaseId}/getDefinition?format=sqlproj
```

The API requires read-write item permission and
`SQLDatabase.ReadWrite.All` or `Item.ReadWrite.All`. Supported formats are
`dacpac` and `sqlproj`; the latter can include object DDL and
`.sharedqueries/*.sql`. For Atlas, `sys.*` plus `VIEW DEFINITION` is easier to
constrain and does not require a write-capable Fabric scope. If definitions are
ever enabled, exclude `.sharedqueries` and apply a DDL allowlist.
([Get SQL Database Definition](https://learn.microsoft.com/en-us/rest/api/fabric/sqldatabase/items/get-sql-database-definition),
[SQL Database definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/sql-database-definition))

### Scanner and lineage

The current Purview inventory table names **SQL analytics endpoint** but does
not list the newer OLTP `SQLDatabase` item. The general scanner documentation
only promises internal-object metadata for Power BI semantic models, with
Lakehouse sub-item metadata separately described as preview. Therefore:

- item/sub-item scanner support for the OLTP `SQLDatabase` should be marked
  **undocumented/uncertain**;
- support for an associated `SQLEndpoint` must not be reported as coverage of
  the OLTP database;
- no public Fabric SQLDatabase REST endpoint was found for table- or
  column-level lineage.

([Fabric metadata scanning](https://learn.microsoft.com/en-us/fabric/governance/metadata-scanning-overview),
[Fabric lineage in Purview](https://learn.microsoft.com/en-us/purview/data-map-lineage-fabric),
[Connect to SQL Database in Fabric](https://learn.microsoft.com/en-us/fabric/database/sql/connect))

## 3. Fabric IQ Ontology and GraphModel

### Ontology definition metadata

Ontology and GraphModel item APIs are explicitly **Preview**. Listing either
type requires a Viewer workspace role and `Workspace.Read.All` or
`Workspace.ReadWrite.All`.
([List Ontologies](https://learn.microsoft.com/en-us/rest/api/fabric/ontology/items/list-ontologies),
[List Graph Models](https://learn.microsoft.com/en-us/rest/api/fabric/graphmodel/items/list-graph-models))

Per-item metadata is available without definition access:

```http
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/ontologies/{ontologyId}
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/graphModels/{graphModelId}
```

These reads require item read permission and accept `Item.Read.All` or
`Item.ReadWrite.All`.
([Get Ontology](https://learn.microsoft.com/en-us/rest/api/fabric/ontology/items/get-ontology),
[Get Graph Model](https://learn.microsoft.com/en-us/rest/api/fabric/graphmodel/items/get-graph-model))

```http
POST https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/ontologies/{ontologyId}/getDefinition
```

This API requires read-write permission and `Item.ReadWrite.All`, supports
long-running operations, omits the sensitivity label from the definition, and
is blocked for ontologies with encrypted sensitivity labels.
([Get Ontology Definition](https://learn.microsoft.com/en-us/rest/api/fabric/ontology/items/get-ontology-definition))

The documented definition parts contain:

- entity types with IDs, names, identity/display properties, normal,
  time-series, and untyped properties, value types, and optional semantic
  enrichment;
- data bindings mapping source workspace/item/table/schema/columns to ontology
  properties;
- relationship types linking source and target entity types;
- contextualizations mapping relationship source/target keys to source
  columns;
- optional documents, overviews, and resource links.

These structures provide **definition metadata and grounding/lineage mappings**,
not entity instances.
([Ontology definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/ontology-definition))

For Atlas, retain an allowlist of entity/relationship identifiers, names,
property types, binding source identifiers, table/column mappings, and
contextualization key mappings. Exclude:

- `EntityTypes/*/Documents/*`;
- `EntityTypes/*/ResourceLinks/*`;
- arbitrary resource URLs;
- any literal filter values if future or tenant-specific payloads surface them;
- unreviewed free-form/custom attribute bags.

### GraphModel definition and instance graph

```http
POST https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/graphModels/{graphModelId}/getDefinition
```

The Preview API requires read-write item permission and `Item.ReadWrite.All`.
It returns `graphType`, `graphDefinition`, `dataSources`, and
`stylingConfiguration`. The schemas describe node types, edge types, property
types, source mappings, key columns, and property mappings. Graph mapping
filters can contain literal values, so Atlas should strip each filter's
`value` field or omit filters entirely.
([Get Graph Model Definition](https://learn.microsoft.com/en-us/rest/api/fabric/graphmodel/items/get-graph-model-definition),
[Graph Model definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/graph-model-definition))

Definition metadata is separate from the instance graph. Microsoft now
documents a public GQL execution endpoint:

```http
POST https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/GraphModels/{graphModelId}/executeQuery?preview=true
Content-Type: application/json

{ "query": "MATCH (n) RETURN n LIMIT 100" }
```

The API accepts user-delegated or application bearer tokens and returns typed
query results, including node and edge references and projected property
values. It is therefore capable of enumerating business entities and
relationships. Atlas should **not call this endpoint**: there is no general
instance-enumeration mode that guarantees metadata-only output.
([GQL Query HTTP API](https://learn.microsoft.com/en-us/fabric/graph/gql-query-api))

The FGI-MAIN GraphModel counts (12 node types and 14 edge types) came from the
definition only. No instance graph was read.

### Scanner and lineage

Current Purview inventory documentation does not list Ontology or GraphModel.
Treat scanner/lineage support for these item types as
**undocumented/uncertain**. Atlas can derive reliable configuration lineage
from Ontology bindings and GraphModel source/property mappings, but should label
it as definition-derived rather than scanner-derived operational lineage.
([Fabric lineage in Purview](https://learn.microsoft.com/en-us/purview/data-map-lineage-fabric))

## 4. Fabric Data Agent

### Item type and management APIs

`DataAgent` is a first-class Fabric item type. The public v1 operation group
currently exposes create, delete, get, get definition, list, publish, update,
and update definition operations.
([DataAgent REST operations](https://learn.microsoft.com/en-us/rest/api/fabric/dataagent/items))

```http
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/dataAgents
GET https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/dataAgents/{dataAgentId}
```

List requires a Viewer workspace role plus `Workspace.Read.All` or
`Workspace.ReadWrite.All`; Get requires item read permission plus
`Item.Read.All` or `Item.ReadWrite.All`. Get can return
`properties.publishedDescription`.
([List Data Agents](https://learn.microsoft.com/en-us/rest/api/fabric/dataagent/items/list-data-agents),
[Get Data Agent](https://learn.microsoft.com/en-us/rest/api/fabric/dataagent/items/get-data-agent))

Microsoft describes the Fabric data agent product as **generally available**,
with an F2/P1-or-higher capacity prerequisite. Individual integrations can
still be preview.
([Fabric data agent overview](https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent))

### Definition metadata

```http
POST https://api.fabric.microsoft.com/v1/workspaces/{workspaceId}/dataAgents/{dataAgentId}/getDefinition
```

The API requires read-write item permission and `Item.ReadWrite.All`.
([Get Data Agent Definition](https://learn.microsoft.com/en-us/rest/api/fabric/dataagent/items/get-data-agent-definition))

The documented JSON definition contains:

| Part | Catalog treatment |
|---|---|
| `Files/Config/data_agent.json` | Keep schema version |
| `draft|published/stage_config.json` | Exclude `aiInstructions` and experimental bags |
| `draft|published/{source}/datasource.json` | Keep `artifactId`, `workspaceId`, display name, documented source type, and selected structural `elements` |
| `draft|published/{source}/fewshots.json` | Exclude all questions and queries |
| `publish_info.json` | Published description is ordinary item metadata; retain only if existing description policy allows it |

The current public schema names the selected tree `elements`; the supplied
tenant evidence described it as a selected-element tree. The schema also
contains `dataSourceInstructions`, `userDescription`, and an open-ended
`metadata` bag. Exclude `dataSourceInstructions`; treat `userDescription` and
the open-ended bag as opt-in fields rather than safe structural metadata.
([Data Agent definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/data-agent-definition))

Documented source-type values include Lakehouse, Warehouse, Kusto, semantic
model, graph, mirrored database, and mirrored Azure Databricks. The product
overview lists Lakehouse, Warehouse, semantic model, KQL Database, mirrored
database, Ontology, and Microsoft Graph. The current public definition schema
does **not** explicitly list Fabric SQL Database (OLTP) as a source type; mark
that capability **unsupported/uncertain** rather than inferring it from
Warehouse or mirrored-database support.
([Data Agent definition](https://learn.microsoft.com/en-us/rest/api/fabric/articles/item-management/definitions/data-agent-definition),
[Fabric data agent overview](https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent))

### Lineage and query/chat surfaces

The source `workspaceId`, `artifactId`, type, and selected `elements` support
configuration lineage from DataAgent to its configured sources and schema
elements. No dedicated DataAgent lineage REST operation is listed, and current
Purview inventory documentation does not list DataAgent, so scanner-derived
lineage is **undocumented/uncertain**.
([DataAgent REST operations](https://learn.microsoft.com/en-us/rest/api/fabric/dataagent/items),
[Fabric lineage in Purview](https://learn.microsoft.com/en-us/purview/data-map-lineage-fabric))

The Fabric DataAgent REST operation group does not expose a direct chat or
execute-query operation. However, Microsoft documents two first-party
consumption routes:

- Copilot Studio can add a published Fabric data agent through the Fabric IQ
  Data MCP tool, using user or maker credentials.
  ([Copilot Studio integration](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-microsoft-copilot-studio-tool))
- Microsoft Foundry Agent Service can call a published Fabric data agent through
  `MicrosoftFabricPreviewTool`; the integration supports SDKs and Foundry REST,
  uses end-user identity passthrough, requires the same tenant and region, and
  does not support service-principal authentication for the Fabric data-agent
  call.
  ([Foundry integration](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/fabric))

These routes execute questions against governed data and return business
answers. They are not metadata discovery mechanisms and should remain outside
Atlas's crawler.

Fabric data-agent execution is read-only and uses the requesting user's
effective permissions; RLS/CLS and supported Purview controls continue to
apply. That protects query execution but does not make returned answers
metadata-only.
([Data Agent sharing and permissions](https://learn.microsoft.com/en-us/fabric/data-science/data-agent-sharing),
[Fabric data agent overview](https://learn.microsoft.com/en-us/fabric/data-science/concept-data-agent))

## Cross-cutting permission result

| Surface | Public permission requirement | Atlas implication |
|---|---|---|
| Type-specific workspace list APIs | Viewer workspace role + `Workspace.Read.All` or `Workspace.ReadWrite.All` | Use existing workspace inventory permission/path; `Item.Read.All` alone is not the documented scope for these list routes |
| Per-item Get for KQL, SQL, DataAgent | Item read + `Item.Read.All` or type-specific read where offered | Compatible with the stated Atlas read-only item scope |
| KQL Database `getDefinition` | Read-write item + `KQLDatabase.ReadWrite.All` or `Item.ReadWrite.All` | Do not use by default; prefer Kusto management endpoint |
| SQL Database `getDefinition` | Read-write item + `SQLDatabase.ReadWrite.All` or `Item.ReadWrite.All` | Do not use by default; prefer TDS `sys.*` |
| Ontology `getDefinition` | Read-write item + `Item.ReadWrite.All`; Preview; blocked by encrypted sensitivity label | Separate opt-in connector only |
| GraphModel `getDefinition` | Read-write item + `Item.ReadWrite.All`; Preview | Separate opt-in connector only |
| DataAgent `getDefinition` | Read-write item + `Item.ReadWrite.All` | Separate opt-in connector with strict field allowlist |
| GraphModel GQL query | Fabric bearer token; user and application access documented; endpoint uses `preview=true` | Exclude because results can contain graph instances and property values |

## Prioritized feasibility

| Priority | Capability | Support status | Difficulty | Recommended Atlas scope |
|---|---|---|---|---|
| P0 | Eventhouse/KQL Database item properties | Public v1 REST | Low | Add IDs, parent/child links, database type, query endpoint; never store ingestion credentials |
| P0 | KQL tables, columns, functions, materialized views | Public Kusto management API | Medium | Add through `/v1/rest/mgmt`, `x-ms-readonly: true`, a command allowlist, and a Viewer/Monitor identity |
| P0 | SQL Database item and connection metadata | Public v1 REST | Low | Add OLTP item metadata; identify it separately from `SQLEndpoint` |
| P0 | SQL tables, columns, views, keys/indexes | Public TDS `sys.*` | Medium | Add with Fabric Read + SQL `VIEW DEFINITION`; do not grant `ReadData`/`db_datareader` solely for cataloging |
| P1 | KQL selected policy metadata | Public Kusto management API | Medium | Add policy presence/settings; omit expressions/literals unless explicitly approved |
| P1 | DataAgent source and selected-element configuration | Public v1 definition API; product GA | Medium-High | Opt-in only because of `Item.ReadWrite.All`; retain structural allowlist and discard instructions/few-shots |
| P1 | Ontology types, properties, bindings, relationships, contextualizations | Public Preview definition API | Medium-High | Opt-in only; retain structural metadata, exclude documents/resource links and arbitrary values |
| P1 | GraphModel node/edge types and mappings | Public Preview definition API | Medium-High | Opt-in only; strip filter literals and never query instances |
| P2 | Purview/scanner item-level lineage for KQL Database | Documented item-level support | Medium | Import as coarse lineage; do not imply table/column lineage |
| P2 | Scanner lineage for SQLDatabase, Ontology, GraphModel, DataAgent | Not documented in current inventory | Unknown | Do not promise; probe only after Microsoft documents the item type |
| Defer | KQL/SQL `getDefinition` | Public but write-scoped | Medium-High | Redundant with safer native metadata paths |
| Exclude | Ontology documents/resource links, GraphModel filter literal values | Present in definitions | Low | Drop before persistence |
| Exclude | DataAgent AI/data-source instructions and few-shot content | Present in definitions | Low | Drop before persistence |
| Exclude | Graph instances and GQL results | Public Preview query API, contains entity data | High risk | Never ingest |
| Exclude | DataAgent chat/Foundry/Copilot answers | First-party consumption APIs/tools, contains business answers | High risk | Never ingest |

## Recommended implementation boundary

1. Keep Atlas's default Fabric crawler read-only. Add KQL metadata through
   `queryServiceUri` plus `/v1/rest/mgmt` and add SQL metadata through TDS plus
   `VIEW DEFINITION`.
2. Do not replace `Item.Read.All` with broad `Item.ReadWrite.All` for the
   default sync. If Ontology, GraphModel, or DataAgent definitions are required,
   use separate consent, credentials, feature flags, audit logging, and a
   hardcoded set of GET/list/getDefinition routes.
3. Parse definition payloads through positive field allowlists. Never persist
   unknown JSON fields automatically as these preview schemas evolve.
4. Exclude AI instructions, data-source instructions, few-shot questions and
   queries, graph filter literal values, Ontology documents/resource links,
   shared SQL queries, and every graph/query result.
5. Label lineage by provenance: `definition-binding`, `definition-mapping`, or
   `Purview-item-lineage`. Do not present inferred sub-item lineage as scanner
   lineage.
6. Recheck Preview status and definition schemas before enabling Ontology or
   GraphModel support in production.

## Unsupported, private, preview, and uncertain summary

- **Preview:** Ontology item/API, GraphModel item/API, GraphModel GQL execution,
  and the Foundry `MicrosoftFabricPreviewTool`.
- **Private APIs:** none are used or recommended in this audit. Tenant-observed
  fields that are absent from the current public schema must not be treated as
  a stable contract.
- **Unsupported for Atlas by policy:** all graph instances/GQL results, DataAgent
  answers, AI instructions, few-shots, Ontology documents/resource links, and
  literal-valued graph filters.
- **Not exposed as a direct public Fabric DataAgent API:** chat/query execution;
  the public DataAgent operation group is management/definition/publish only.
- **Uncertain/undocumented:** Purview scanner support for OLTP `SQLDatabase`,
  Ontology, GraphModel, and DataAgent; KQL `getDefinition` behavior for
  `ReadOnly` databases; direct Fabric SQL Database (OLTP) as a DataAgent source.
- **Public but unsuitable as the default:** all reviewed `getDefinition`
  endpoints because they require read-write item permission even when Atlas
  only reads the response.
