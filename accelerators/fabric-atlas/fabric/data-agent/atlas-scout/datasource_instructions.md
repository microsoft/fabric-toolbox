Fabric Atlas governance store. All tables are in schema dbo. Each sync of a Fabric workspace creates an immutable snapshot.

# Snapshot rule (MANDATORY)
- dbo.Workspaces has ONE ROW PER SNAPSHOT of a workspace. Workspaces.fabricId = Fabric workspace GUID; Workspaces.snapshotId = snapshot of that row; syncedAt = when it was published.
- The current state of a workspace = the Workspaces row with the most recent syncedAt for its fabricId:
  WITH latest AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY fabricId ORDER BY syncedAt DESC) AS rn FROM dbo.Workspaces) ... WHERE rn = 1
- Snapshot tables (FabricItems, LineageEdges, AccessGrants, Principals, JobRuns, ConfigEntries, OperationalIncidents, AccessPolicyEvidences, ItemRelationsEvidenceSnapshots, SyncRuns) have workspace_id = Workspaces.fabricId (the Fabric workspace GUID, NOT Workspaces.id) and snapshotId. Always join: t.workspace_id = latest.fabricId AND t.snapshotId = latest.snapshotId.
- WorkspaceScopes.id = Fabric workspace GUID of each workspace selected in Atlas.

# Main tables
- Workspaces: displayName, capacity (capacity id), region, fabricDomainId (NULL = not assigned to a domain), itemCount, healthyCount, failingCount, staleCount, edgeCount, brokenEdgeCount, principalCount, externalPrincipalCount, grantCount, failedJobCount, labelCount, governanceSummaryJson (JSON: pillars.health/protect/trust scores 0-100, findings.critical/high/medium/low, coverage.endorsed/certified/described/labeled/tagged each with numerator/denominator/unknown), syncSectionsJson (status per collected section).
- FabricItems: one row per Fabric item. fabricId = item GUID, displayName, itemType, description, ownerEmail/ownerName, endorsement ('none','promoted','certified'), sensitivity (label name, empty = no label), sensitivityLabelId, tags/tagIds, health ('healthy','failing','unknown'), lastRefresh, itemCreatedAt, itemUpdatedAt, modifiedBy, size.
  Flags sensitivityMetadataAvailable, tagMetadataAvailable, ownerMetadataAvailable, endorsementMetadataAvailable: when 0 the metric was not collected for that item -> exclude from the denominator and report as unknown.
- LineageEdges: sourceFabricId -> targetFabricId (item GUIDs, join FabricItems.fabricId in the same snapshot), relation (writes, Direct Lake, orchestrates, SQL endpoint, Shortcut, ...), broken (1 = broken edge).
- AccessGrants: itemFabricId, principalRef (Principals.principalId), accessLevel ('owner','edit',...), roleName, source ('workspaceRole' or 'directShare'), flag ('admin','servicePrincipal' or empty).
- Principals: principalId, displayName, email, kind ('user','servicePrincipal','group'), [external] (1 = guest / external tenant), workspaceRole (Admin, Member, Contributor, Viewer).
- JobRuns: itemFabricId, itemName, jobType, status ('completed','failed'), startedAt, durationSec, message.
- OperationalIncidents: failed runs promoted to incidents: itemFabricId, itemName, itemType, jobType, occurredAt, firstObservedAt, durationSec.
- Item names: every named Fabric item (lakehouse, warehouse, notebook, pipeline, semantic model, report, ontology, graph, data agent, eventhouse, ...) is a FabricItems row (displayName, itemType, fabricId). Resolve a name the user gives with FabricItems.displayName LIKE '%name%' first; ConfigEntries labels are object names inside items (tables, columns, measures), not item names.
- ConfigEntries: item configuration facts (itemFabricId, section, label, value) AND the full object inventory (tables, views, columns, measures, DAX dependencies, model relationships, object-level lineage, tenant governance evidence). See the section 'Object inventory' below: everything shown in Fabric Atlas is queryable from there.
- SyncRuns: status, startedAt, finishedAt, itemsSynced, failureMessage per sync.
- ExternalDatasets (state 'linked' via fabricItemId or 'to_link') / ExternalLineageEdges (sourceDatasetId -> targetDatasetId, jobName, lastRunState): OpenLineage imports, not snapshot based.
- GovernancePolicies, GovernanceExceptions (expiresAt), FindingAcks, AccessReviews / AccessReviewEvents, Comments: user decisions, not snapshot based.
- Sync*, SavedViews, Users, storage.objects: technical app tables.

# Object inventory (ConfigEntries)
Readable sections (plain text, one fact per row): 'General', 'Tables' (label = object name, value = object type), 'Report pages' (label = page name), 'Data agent sources' (label = 'published:<source>' or 'draft:<source>', value = 'type | item GUID'), 'Data agent selected elements', 'Notebook dependencies' (label 'Default lakehouse' etc.), 'Source provenance' (shortcuts, mirroring state), 'SQL Primary keys', 'SQL Foreign keys' (value 'table(col) -> table(col)'), 'Model' (storage mode, provider), 'OneLake', 'SQL endpoint', 'KQL database', 'Ontology entity types', 'Graph node types', 'KQL stored functions', and similar.

Private JSON sections are CHUNKED. Each row value is 'v1:PPPP:TTTT:<json fragment>' (PPPP = part number, TTTT = total parts, the JSON starts at character 14).
- One document = all rows with the same workspace_id, snapshotId, itemFabricId, section and label. Rebuild it with:
  STRING_AGG(CAST(SUBSTRING(ce.value,14,4000) AS nvarchar(max)),'') WITHIN GROUP (ORDER BY SUBSTRING(ce.value,4,4)) ... GROUP BY ce.workspace_id, ce.itemFabricId, ce.label
  then parse the rebuilt document with OPENJSON / JSON_VALUE. Never parse a single chunk unless value LIKE 'v1:0001:0001:%'.
- '__schema__': one document per object (label = object name, itemFabricId = the item that owns it). JSON: {name, objectType, source, columns:[{name,dataType,isHidden}], measures:[{name,expr,expressionStatus}]}.
  objectType values: 'Model table' (semantic model table; measures live here, expr = DAX), 'SQL endpoint table', 'SQL endpoint view', 'SQL table', 'SQL view', 'Managed' (lakehouse table), 'KQL table', 'KQL function', 'KQL external table', 'Ontology entity', 'Ontology relationship', 'Graph node', 'Graph edge', 'Notebook object reference', 'Data Agent source'. Ignore 'Atlas item metadata'.
  Measures: CROSS APPLY OPENJSON(doc,'$.measures') WITH (name nvarchar(400) '$.name', expr nvarchar(max) '$.expr'). Columns: CROSS APPLY OPENJSON(doc,'$.columns') WITH (name nvarchar(400) '$.name', dataType nvarchar(60) '$.dataType').
  When the user searches a word in measures, search the measure name, its table, its semantic model name and its DAX expression, and say which one matched.
- '__semantic_model_evidence__' (label 'model', one document per semantic model): $.dependencies[] = {table, object, objectType ('measure','column','calculatedColumn'), referencedTable, referencedObject, referencedObjectType, source} = DAX dependency edges; $.relationships[] = {name, fromTable, fromColumn, toTable, toColumn} = model relationships.
- '__object_edges__' (label 'workspace', one document per workspace): JSON array of verified object-level lineage edges {source:{itemId,kind,name,tableName}, target:{itemId,kind,name,tableName}, relation, confidence}. source.itemId / target.itemId = FabricItems.fabricId. Kinds: sourceObject (table), sourceField (column), notebookObject, ontologyEntity, ontologyProperty, ontologyRelationship, graphNode, graphEdge, dataAgentSource, dataAgentElement. Relations: reads, writes, contains (table -> column), binds entity, binds property, selected by agent, agent source, edge source, edge destination, relationship source/target. Exclude relation 'contains' and kind 'dataAgentElement' unless the user asks for columns or data agent elements. Object-lineage recipe (do NOT join LineageEdges or JobRuns, they are item-level): read the edges with CROSS APPLY OPENJSON(d.doc) e and JSON_VALUE(e.value,'$.source.name'), JSON_VALUE(e.value,'$.source.kind'), JSON_VALUE(e.value,'$.source.itemId'), JSON_VALUE(e.value,'$.relation'), same for target; always display each object as name + ' (' + COALESCE(item displayName,'external') + ')' through LEFT JOIN FabricItems on fabricId = itemId in the same snapshot, because a notebookObject carries the name of the table it reads or writes and Source would otherwise equal Target; filter object names with LIKE '%name%' (names are qualified, e.g. 'dbo.fact_sales' or 'Lakehouse.SCHEMA.TABLE'); to find the edges of an item (ontology, notebook, lakehouse, graph) filter on the source or target item FabricItems.displayName LIKE '%name%', never on the object name.
- '__governance_evidence__' (label 'workspace', one document per workspace): $.domains.entries[] {id, displayName, workspaceCount}; $.tags.entries[]; $.tenantSettings.entries[] {settingName, title, enabled, group}; $.network.policy {inboundPublicAccess, outboundPublicAccess}; $.externalShares.entries[]; $.oneLakeRoles.entries[] {itemId, roleName, permissions, paths, itemMemberCount, rowSecurity, columnSecurity}. Each block has $.<block>.status.status = 'complete', 'unsupported' or 'failed': report unsupported/failed as unknown. Tenant-level blocks (domains, tenantSettings) are repeated in every workspace: use DISTINCT.
- Overview counter 'Tables, columns & measures' = objects + columns + measures in '__schema__' (latest snapshots).

# Graph rendering
Any Markdown table with Source and Target columns is drawn as a graph (item/object lineage, DAX dependencies, model relationships). Name the type columns 'Source type' and 'Target type'.

# Object lineage SQL template (copy it, change only the final WHERE)
WITH latest AS (SELECT fabricId, snapshotId, ROW_NUMBER() OVER (PARTITION BY fabricId ORDER BY syncedAt DESC) rn FROM dbo.Workspaces),
docs AS (SELECT ce.workspace_id, STRING_AGG(CAST(SUBSTRING(ce.value,14,4000) AS nvarchar(max)),'') WITHIN GROUP (ORDER BY SUBSTRING(ce.value,4,4)) AS doc FROM dbo.ConfigEntries ce JOIN latest l ON ce.workspace_id = l.fabricId AND ce.snapshotId = l.snapshotId AND l.rn = 1 WHERE ce.section = '__object_edges__' AND ce.label = 'workspace' GROUP BY ce.workspace_id),
items AS (SELECT i.fabricId, i.displayName FROM dbo.FabricItems i JOIN latest l ON i.workspace_id = l.fabricId AND i.snapshotId = l.snapshotId AND l.rn = 1),
edges AS (SELECT COALESCE(JSON_VALUE(x.value,'$.source.tableName'), JSON_VALUE(x.value,'$.source.name')) AS sourceTable, JSON_VALUE(x.value,'$.source.name') AS sourceName, JSON_VALUE(x.value,'$.source.kind') AS sourceKind, JSON_VALUE(x.value,'$.source.itemId') AS sourceItemId, JSON_VALUE(x.value,'$.relation') AS relation, JSON_VALUE(x.value,'$.target.name') AS targetName, JSON_VALUE(x.value,'$.target.kind') AS targetKind, JSON_VALUE(x.value,'$.target.itemId') AS targetItemId FROM docs d CROSS APPLY OPENJSON(d.doc) x)
SELECT DISTINCT e.sourceName + ' (' + COALESCE(si.displayName,'external') + ')' AS [Source], e.sourceKind AS [Source type], e.relation AS [Relation], e.targetName + ' (' + COALESCE(ti.displayName,'external') + ')' AS [Target], e.targetKind AS [Target type]
FROM edges e LEFT JOIN items si ON si.fabricId = e.sourceItemId LEFT JOIN items ti ON ti.fabricId = e.targetItemId
WHERE e.sourceName LIKE '%fact_sales%' OR e.targetName LIKE '%fact_sales%' OR e.sourceTable LIKE '%fact_sales%'
Variants of the final SELECT/WHERE:
- Lineage of a table or column: the WHERE above with the object name. Keep the 'contains' edges (table -> columns): for many tables they are the only edges. Matching is case-insensitive.
- If this query returns rows, the object HAS lineage: show the rows as the graph table. Never answer that no lineage exists when rows came back.
- Tables that feed an ontology (or graph, data agent): SELECT DISTINCT e.sourceTable + ' (' + COALESCE(si.displayName,'external') + ')' AS [Source], 'table' AS [Source type], 'feeds' AS [Relation], ti.displayName AS [Target], 'Ontology' AS [Target type] ... WHERE e.targetKind LIKE 'ontology%' AND e.sourceKind IN ('sourceObject','sourceField') AND ti.displayName LIKE '%AcuteCareOperationsOntology%'. Ontology bindings are source fields/tables -> ontology entities/properties; the ontology is the TARGET ITEM (ti.displayName), never an object name.
- Tables read and written by notebooks: WHERE e.relation IN ('reads','writes').

# Usage SQL template
Atlas has NO view counts. "Used most" / "popular" = reach: downstream items (LineageEdges) + principals with access (AccessGrants). Say so in one sentence, then run:
WITH l AS (SELECT fabricId, displayName, snapshotId, ROW_NUMBER() OVER (PARTITION BY fabricId ORDER BY syncedAt DESC) rn FROM dbo.Workspaces)
SELECT TOP 20 l.displayName AS [Workspace], i.displayName AS [Item], i.itemType AS [Type], i.endorsement AS [Endorsement],
 (SELECT COUNT(DISTINCT e.targetFabricId) FROM dbo.LineageEdges e WHERE e.workspace_id=i.workspace_id AND e.snapshotId=i.snapshotId AND e.sourceFabricId=i.fabricId) AS [Downstream items],
 (SELECT COUNT(DISTINCT g.principalRef) FROM dbo.AccessGrants g WHERE g.workspace_id=i.workspace_id AND g.snapshotId=i.snapshotId AND g.itemFabricId=i.fabricId) AS [Principals with access]
FROM dbo.FabricItems i JOIN l ON i.workspace_id=l.fabricId AND i.snapshotId=l.snapshotId AND l.rn=1
WHERE i.itemType IN ('SemanticModel','Report') AND i.endorsementMetadataAvailable=1 AND COALESCE(i.endorsement,'none') NOT IN ('promoted','certified')
ORDER BY 5 DESC, 6 DESC
Drop the endorsement or itemType filter when not asked.

# Conventions
- "Stale" = item with itemUpdatedAt and lastRefresh older than 90 days.
- "External user / guest" = Principals.[external] = 1 (external is a reserved word: ALWAYS bracket it). Items shared externally: AccessGrants g JOIN Principals p ON p.workspace_id=g.workspace_id AND p.snapshotId=g.snapshotId AND p.principalId=g.principalRef LEFT JOIN FabricItems i ON i.fabricId=g.itemFabricId (same snapshot), latest snapshots, WHERE p.[external]=1; also read $.externalShares in '__governance_evidence__'. No rows = no external access found: say so with the number of principals checked.
- Domain names are stored in the governance evidence ('__governance_evidence__' above): join Workspaces.fabricDomainId to $.domains.entries[].id to get the displayName.

# SQL dialect rules
- The engine is Synapse SQL: recursive CTEs (a CTE that references itself) are NOT supported and fail.
- To walk lineage over several hops, chain non recursive CTEs: hop1 = edges whose sourceFabricId is the root item, hop2 = edges whose sourceFabricId IN (SELECT targetFabricId FROM hop1), and so on up to hop4, then UNION ALL them. For upstream lineage, swap source and target.
- Lineage can contain cycles: deduplicate edges with GROUP BY.
- LineageEdges.broken is a bit: use MAX(CAST(broken AS int)).
- Short aliases (e, m, c, r, dep); never reserved words (edge, node, table, object, key) as alias.
- Items can share a display name (Lakehouse / SQLEndpoint): return the item type too.
- OPENJSON, JSON_VALUE, JSON_QUERY, ISJSON and STRING_AGG ... WITHIN GROUP are supported. JSON_VALUE on a non-object value fails: only apply '$.status.status' to object blocks.
