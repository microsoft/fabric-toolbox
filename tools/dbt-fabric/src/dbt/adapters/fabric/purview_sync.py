import json
from datetime import UTC, datetime

from dbt.adapters.events.logging import AdapterLogger
from dbt.adapters.fabric.fabric_api_client import FabricApiClient
from dbt.adapters.fabric.purview_client import PurviewClient, _qualifiedname_matches
from dbt.adapters.fabric.purview_types import (
    AtlasEntity,
    BulkResponse,
    DbtMetadataAttrs,
    PurviewEntityRef,
)

logger = AdapterLogger("fabric")

_FABRIC_PORTAL_BASE_URL = "https://app.fabric.microsoft.com"
_FABRIC_GROUPS_URL = f"{_FABRIC_PORTAL_BASE_URL}/groups"


def extract_syncable_models(graph: dict, results: list | None = None) -> list[dict]:
    """Extract models, seeds, and snapshots from the dbt graph that should be synced to Purview.

    This is the first step in the sync flow (called before PurviewSync.resolve_entities).
    When results are provided (e.g. from an on-run-end hook), only nodes that actually
    ran in this invocation are included. When results is None (e.g. a manual run-operation),
    all syncable nodes in the graph are returned.

    Graph nodes are plain dicts (dbt's flat_graph calls to_dict() on each node).
    Results are RunResult objects with .node (a dataclass) and .status attributes.
    """
    syncable_types = ("model", "seed", "snapshot")
    models = []

    ran_node_ids: set[str] | None = None
    if results is not None:
        ran_node_ids = {r.node.unique_id for r in results}

    nodes = graph.get("nodes", {})
    for node in nodes.values():
        if node.get("resource_type", "") not in syncable_types:
            continue

        unique_id = node.get("unique_id", "")
        if ran_node_ids is not None and unique_id not in ran_node_ids:
            continue

        if node.get("config", {}).get("materialized") == "ephemeral":
            continue

        if not _has_persist_docs_enabled(node):
            continue

        models.append(node)

    return models


def _has_persist_docs_enabled(node: dict) -> bool:
    """Check whether a node's persist_docs config allows Purview sync.

    Returns True (sync) when persist_docs is absent or has any true value.
    Returns False (skip) only when persist_docs is explicitly configured with all values false.
    """
    persist_docs = node.get("config", {}).get("persist_docs")
    if not persist_docs:
        return True
    return persist_docs.get("relation", True) or persist_docs.get("columns", True)


def _make_cache_key(database: str, schema: str, name: str) -> str:
    return f"{database}.{schema}.{name}".lower()


_TEMP_GUID = "-1"


def _extract_guid(result: BulkResponse, temp_guid: str = _TEMP_GUID) -> str | None:
    """Extract the GUID for an entity from a bulk_create_or_update response.

    Relies on guidAssignments populated by the temp negative GUID in the create payload.
    Falls back to mutatedEntities if guidAssignments doesn't contain the temp GUID.
    """
    assignments = result.get("guidAssignments", {})
    if temp_guid in assignments:
        return assignments[temp_guid]
    for entities in result.get("mutatedEntities", {}).values():
        for entity in entities:
            guid = entity.get("guid")
            if guid:
                return guid
    return None


class PurviewSync:
    """Orchestrates syncing dbt metadata to Purview: descriptions, business metadata, and lineage.

    Entry point is BaseFabricAdapter.purview_sync(), which is called from the
    {{ purview_sync() }} Jinja macro (typically as an on-run-end hook). The flow is:

        1. extract_syncable_models() — filters the dbt graph to models/seeds/snapshots
        2. resolve_entities() — matches each dbt node to a Purview entity by searching
           on table name and filtering on the Fabric item GUID (resolved via FabricApiClient)
        3. push_descriptions() — writes model and column descriptions to Purview
        4. push_business_metadata() — attaches dbt tags, materialization, test results, etc.
           Test names are derived from the graph: test nodes list their dependencies, so we
           build a reverse mapping of model → test names at init time.
        5. push_lineage() — creates dbt_transformation process entities for upstream
           dependencies, including both model-to-model and source-to-model edges. Source
           entities are resolved lazily from graph["sources"] when encountered as dependencies.

    The graph parameter is the dbt flat_graph dict (available as {{ graph }} in Jinja macros),
    containing all nodes (models, tests, seeds, snapshots) and sources in the project.
    Nodes and sources inside the graph are plain dicts (flat_graph calls to_dict() on each).

    The FabricApiClient is needed because Purview qualifiedNames for Lakehouse tables
    contain the Fabric item GUID (not the human-readable name). This class resolves
    Lakehouse/Warehouse names to GUIDs so search results can be filtered accurately.
    """

    def __init__(
        self,
        client: PurviewClient,
        fabric_client: FabricApiClient,
        graph: dict,
        catalog_columns: dict[str, list[tuple[str, str]]] | None = None,
    ) -> None:
        self._client = client
        self._fabric_client = fabric_client
        self._graph = graph
        self._catalog_columns = catalog_columns or {}
        self._entity_cache: dict[str, PurviewEntityRef] = {}
        self._item_cache: dict[str, tuple[str, str] | None] = {}
        self._lakehouses: list[dict] | None = None
        self._warehouses: list[dict] | None = None
        self._test_mapping = self._build_test_mapping()

    def _resolve_item(self, database: str) -> tuple[str, str] | None:
        """Resolve a Fabric item name to its type and GUID (case-insensitive).

        Returns ("lakehouse", item_id) or ("warehouse", item_id), or None if not found.
        """
        lower_db = database.lower()
        if lower_db in self._item_cache:
            return self._item_cache[lower_db]

        if self._lakehouses is None:
            self._lakehouses = self._fabric_client.get_lakehouses()
        for lh in self._lakehouses:
            if lh["displayName"].lower() == lower_db:
                result = ("lakehouse", lh["id"])
                self._item_cache[lower_db] = result
                return result

        if self._warehouses is None:
            self._warehouses = self._fabric_client.get_warehouses()
        for wh in self._warehouses:
            if wh["displayName"].lower() == lower_db:
                result = ("warehouse", wh["id"])
                self._item_cache[lower_db] = result
                return result

        self._item_cache[lower_db] = None
        return None

    def _build_test_mapping(self) -> dict[str, list[str]]:
        """Build a mapping of model/seed/snapshot unique_id to test names from the graph.

        Walks all nodes in the graph, finds test nodes, and maps each test back to the
        models/seeds/snapshots it depends on via depends_on.nodes.
        """
        mapping: dict[str, list[str]] = {}
        nodes = self._graph.get("nodes", {})

        syncable_prefixes = ("model.", "seed.", "snapshot.")
        for node in nodes.values():
            if node.get("resource_type", "") != "test":
                continue

            test_name = node.get("name", "")
            if not test_name:
                continue

            dep_nodes = node.get("depends_on", {}).get("nodes", [])
            for dep_id in dep_nodes:
                if any(dep_id.startswith(p) for p in syncable_prefixes):
                    mapping.setdefault(dep_id, []).append(test_name)

        return mapping

    def _pick_best_entity(
        self, results: list[PurviewEntityRef], db_ids: list[str] | None
    ) -> PurviewEntityRef:
        """Pick the best Purview entity from search results, preferring database ID matches."""
        if len(results) == 1 or not db_ids:
            return results[0]

        lower_ids = [i.lower() for i in db_ids]
        for r in results:
            if _qualifiedname_matches(r.get("qualifiedName", ""), lower_ids):
                return r

        return results[0]

    def resolve_entities(self, models: list[dict]) -> dict[str, PurviewEntityRef]:
        """Match dbt models to Purview entities, creating them if they don't exist.

        Searches for existing entities first. When no match is found, creates the
        entity via the Purview API (including parent entities like warehouse/schema
        for DW models). Returns a dict mapping both unique_id and cache_key to
        the Purview entity for each matched or created entity.
        """
        cache: dict[str, PurviewEntityRef] = {}

        for model in models:
            name = model.get("alias") or model.get("name", "")
            schema = model.get("schema", "")
            database = model.get("database", "")
            unique_id = model.get("unique_id", "")

            if not name:
                continue

            cache_key = _make_cache_key(database, schema, name)
            if cache_key in cache:
                cache[unique_id] = cache[cache_key]
                continue

            item = self._resolve_item(database) if database else None
            db_ids = [item[1]] if item else None
            if item:
                results = self._client.search_entities(name=name, database_identifiers=db_ids)
            else:
                results = []

            if results:
                entity = self._pick_best_entity(results, db_ids)
                if len(results) > 1:
                    logger.info(
                        f"Purview: {len(results)} entities found for {cache_key}, "
                        f"using {entity.get('qualifiedName', 'unknown')}"
                    )
            else:
                entity = self._create_entity_for_model(model)
                if entity is None:
                    logger.info(f"Purview: no entity found for {cache_key}, skipping")
                    continue

            cache[cache_key] = entity
            cache[unique_id] = entity

        self._entity_cache = cache
        return cache

    def _create_entity_for_model(self, model: dict) -> PurviewEntityRef | None:
        """Create Purview entities for a dbt model that has no existing entity.

        For warehouse models: creates warehouse, schema, and table entities.
        For lakehouse models: creates a table entity.
        Returns a search-result-like dict for the table entity, or None on failure.
        """
        database = model.get("database", "")
        if not database:
            return None

        item = self._resolve_item(database)
        if item is None:
            return None

        item_type, item_id = item
        workspace_id = self._fabric_client.get_workspace_id()
        schema = model.get("schema", "")
        name = model.get("alias") or model.get("name", "")

        if item_type == "warehouse":
            return self._create_warehouse_entities(workspace_id, item_id, database, schema, name)
        return self._create_lakehouse_table(workspace_id, item_id, schema, name)

    def _create_warehouse_entities(
        self,
        workspace_id: str,
        warehouse_id: str,
        warehouse_name: str,
        schema: str,
        table_name: str,
    ) -> PurviewEntityRef | None:
        """Create fabric_warehouse, fabric_warehouse_schema, and fabric_warehouse_table entities.

        Entities are created sequentially because Purview requires referenced entities
        to exist before they can be used in relationshipAttributes.
        """
        self._client.ensure_warehouse_types()
        wh_qn = f"{_FABRIC_GROUPS_URL}/{workspace_id}/warehouses/{warehouse_id}"
        schema_qn = f"{wh_qn}/schemas/{schema}"
        table_qn = f"{schema_qn}/tables/{table_name}"

        self._client.bulk_create_or_update(
            [
                {
                    "typeName": "fabric_warehouse",
                    "attributes": {"qualifiedName": wh_qn, "name": warehouse_name},
                },
            ]
        )
        self._client.bulk_create_or_update(
            [
                {
                    "typeName": "fabric_warehouse_schema",
                    "attributes": {"qualifiedName": schema_qn, "name": schema},
                    "relationshipAttributes": {
                        "warehouse": {
                            "typeName": "fabric_warehouse",
                            "uniqueAttributes": {"qualifiedName": wh_qn},
                        },
                    },
                },
            ]
        )
        result = self._client.bulk_create_or_update(
            [
                {
                    "typeName": "fabric_warehouse_table",
                    "guid": _TEMP_GUID,
                    "attributes": {"qualifiedName": table_qn, "name": table_name},
                    "relationshipAttributes": {
                        "dbSchema": {
                            "typeName": "fabric_warehouse_schema",
                            "uniqueAttributes": {"qualifiedName": schema_qn},
                        },
                    },
                },
            ]
        )

        guid = _extract_guid(result)
        if not guid:
            logger.info(f"Purview: created entity {table_qn} but could not determine GUID")
            return None
        logger.info(f"Purview: created warehouse table entity {table_qn}")
        return {
            "id": guid,
            "name": table_name,
            "entityType": "fabric_warehouse_table",
            "qualifiedName": table_qn,
        }

    def _create_lakehouse_table(
        self, workspace_id: str, lakehouse_id: str, schema: str, table_name: str
    ) -> PurviewEntityRef | None:
        """Create a fabric_lakehouse_table entity.

        Purview encodes schema-enabled Lakehouse tables with schema and table name
        joined by %252F (double-URL-encoded slash) in the tables/ segment.
        """
        table_segment = f"{schema}%252F{table_name}" if schema else table_name
        table_qn = (
            f"{_FABRIC_GROUPS_URL}/{workspace_id}/lakehouses/{lakehouse_id}/tables/{table_segment}"
        )

        result = self._client.bulk_create_or_update(
            [
                {
                    "typeName": "fabric_lakehouse_table",
                    "guid": _TEMP_GUID,
                    "attributes": {"qualifiedName": table_qn, "name": table_name},
                },
            ]
        )

        guid = _extract_guid(result)
        if not guid:
            logger.info(f"Purview: created entity {table_qn} but could not determine GUID")
            return None
        logger.info(f"Purview: created lakehouse table entity {table_qn}")
        return {
            "id": guid,
            "name": table_name,
            "entityType": "fabric_lakehouse_table",
            "qualifiedName": table_qn,
        }

    def _resolve_entity_for_node(
        self, node: dict, resolved: dict[str, PurviewEntityRef]
    ) -> PurviewEntityRef | None:
        """Look up the Purview entity for a dbt node, first by unique_id then by cache key."""
        unique_id = node.get("unique_id", "")
        if unique_id in resolved:
            return resolved[unique_id]

        cache_key = _make_cache_key(
            node.get("database", ""),
            node.get("schema", ""),
            node.get("alias") or node.get("name", ""),
        )
        return resolved.get(cache_key)

    def push_metadata(
        self,
        models: list[dict],
        resolved: dict[str, PurviewEntityRef],
        results: list | None = None,
        sync_descriptions: bool = True,
        sync_metadata: bool = True,
    ) -> None:
        """Push descriptions, business metadata, and labels to Purview in a single bulk call.

        Combines model descriptions (userDescription), business metadata (dbt_metadata),
        and labels (dbt tags) into one entity update per model, then sends them all in a
        single bulk API call. Column descriptions still require separate calls since they
        need to fetch referred entities first.
        """
        test_results = self._collect_test_results(models, results) if sync_metadata else {}
        entity_updates: list[AtlasEntity] = []
        column_work: list[tuple[dict, PurviewEntityRef]] = []

        for model in models:
            entity = self._resolve_entity_for_node(model, resolved)
            if entity is None:
                continue

            persist_docs = model.get("config", {}).get("persist_docs", {})
            persist_relation = persist_docs.get("relation", True)
            persist_columns = persist_docs.get("columns", True)

            update: dict = {
                "typeName": entity["entityType"],
                "guid": entity["id"],
                "attributes": {
                    "qualifiedName": entity["qualifiedName"],
                    "name": entity.get("name", model.get("alias") or model.get("name", "")),
                },
            }

            if sync_descriptions and persist_relation:
                description = model.get("description", "")
                if description:
                    update["attributes"]["userDescription"] = description

            if sync_metadata:
                unique_id = model.get("unique_id", "")
                bm_attrs = self._build_business_metadata_attrs(model, unique_id, test_results)
                update["businessAttributes"] = {"dbt_metadata": bm_attrs}

                tags = model.get("tags", [])
                if tags:
                    update["labels"] = list(tags)

            has_content = (
                "userDescription" in update["attributes"]
                or "businessAttributes" in update
                or "labels" in update
            )
            if has_content:
                entity_updates.append(update)

            if sync_descriptions and persist_columns:
                column_work.append((model, entity))

        has_bm = any("businessAttributes" in u for u in entity_updates)
        if has_bm:
            self._client.ensure_business_metadata_type()
        if entity_updates:
            self._client.bulk_create_or_update(entity_updates, merge_business_attrs=has_bm)

        if any("warehouse" in entity["entityType"] for _, entity in column_work):
            self._client.ensure_warehouse_types()
        for model, entity in column_work:
            col_entities = self._build_column_entities(model, entity)
            if col_entities:
                self._client.bulk_create_or_update(col_entities)

    def _build_column_entities(
        self, model: dict, table_entity: PurviewEntityRef
    ) -> list[AtlasEntity]:
        """Build column entity payloads for a table, creating them if they don't exist.

        Merges two column sources:
        - Database catalog (all columns with accurate data types, via catalog_columns)
        - dbt YAML definitions (descriptions and user-specified data types)

        Catalog columns form the base (ensuring all physical columns are represented).
        YAML descriptions are overlaid where available. If no catalog data exists
        (e.g. table not yet created), falls back to YAML-only columns.
        """
        unique_id = model.get("unique_id", "")
        yaml_columns = model.get("columns", {})
        catalog_cols = self._catalog_columns.get(unique_id, [])

        merged: dict[str, dict[str, str]] = {}
        for col_name, data_type in catalog_cols:
            merged[col_name.lower()] = {
                "name": col_name,
                "data_type": data_type,
                "description": "",
            }

        for col in yaml_columns.values():
            col_name = col.get("name", "")
            if not col_name:
                continue
            key = col_name.lower()
            if key in merged:
                if col.get("description"):
                    merged[key]["description"] = col["description"]
            else:
                merged[key] = {
                    "name": col_name,
                    "data_type": col.get("data_type", ""),
                    "description": col.get("description", ""),
                }

        if not merged:
            return []

        table_qn = table_entity["qualifiedName"]
        table_type = table_entity["entityType"]
        is_warehouse = "warehouse" in table_type

        col_entities: list[AtlasEntity] = []
        for col in merged.values():
            col_name = col["name"]
            col_qn = f"{table_qn}/columns/{col_name}"
            data_type = col["data_type"]

            if is_warehouse:
                entity = {
                    "typeName": "fabric_warehouse_table_column",
                    "attributes": {
                        "qualifiedName": col_qn,
                        "name": col_name,
                        "data_type": data_type or "unknown",
                    },
                    "relationshipAttributes": {
                        "table": {
                            "typeName": "fabric_warehouse_table",
                            "uniqueAttributes": {"qualifiedName": table_qn},
                        },
                    },
                }
            else:
                entity = {
                    "typeName": "fabric_lakehouse_table_column",
                    "attributes": {
                        "qualifiedName": col_qn,
                        "name": col_name,
                        "dataType": data_type or "unknown",
                    },
                }

            if col["description"]:
                entity["attributes"]["userDescription"] = col["description"]

            col_entities.append(entity)

        return col_entities

    def _build_business_metadata_attrs(
        self, model: dict, unique_id: str, test_results: dict[str, dict[str, str]]
    ) -> DbtMetadataAttrs:
        """Build the dbt_metadata business metadata attributes dict for a model."""
        tags = model.get("tags", [])
        config = model.get("config", {})
        materialization = config.get("materialized", "")
        meta = model.get("meta", {})
        meta_str = json.dumps(meta) if meta else ""

        test_names = self._get_test_names_for_model(unique_id)
        model_test_results = test_results.get(unique_id, {})
        test_status = self._format_test_status(model_test_results)

        attrs: DbtMetadataAttrs = {
            "dbt_model_id": unique_id,
            "dbt_last_sync": datetime.now(UTC).isoformat(),
        }
        if tags:
            attrs["dbt_tags"] = ",".join(tags) if isinstance(tags, list) else str(tags)
        if materialization:
            attrs["dbt_materialization"] = str(materialization)
        if meta_str:
            attrs["dbt_meta"] = meta_str
        if test_names:
            attrs["dbt_tests"] = (
                ",".join(test_names) if isinstance(test_names, list) else str(test_names)
            )
        if test_status:
            attrs["dbt_test_status"] = test_status
        return attrs

    def push_lineage(
        self,
        models: list[dict],
        resolved: dict[str, PurviewEntityRef],
        is_full_sync: bool = False,
    ) -> None:
        """Create dbt_transformation process entities in Purview to represent data lineage.

        For each model with upstream dependencies (ref/source), creates a Process entity
        with inputs (upstream tables) and outputs (the model's table) so Purview displays
        the lineage graph. Source dependencies are resolved lazily from the graph.
        """
        process_entities: list[AtlasEntity] = []

        for model in models:
            entity = self._resolve_entity_for_node(model, resolved)
            if entity is None:
                continue

            dep_nodes = model.get("depends_on", {}).get("nodes", [])
            if not dep_nodes:
                continue

            unique_id = model.get("unique_id", "")
            materialization = model.get("config", {}).get("materialized", "")

            upstream_refs = []
            for dep_id in dep_nodes:
                dep_entity = self._resolve_dependency_entity(dep_id, resolved)
                if dep_entity is not None:
                    upstream_refs.append(
                        (dep_entity["id"], dep_entity.get("entityType", "DataSet"))
                    )

            if not upstream_refs:
                continue

            process_qn = f"dbt://{unique_id}"
            process_entity = {
                "typeName": "dbt_transformation",
                "attributes": {
                    "qualifiedName": process_qn,
                    "name": model.get("alias") or model.get("name", ""),
                    "dbt_model_id": unique_id,
                    "dbt_materialization": str(materialization) if materialization else "",
                    "inputs": [
                        {"guid": guid, "typeName": type_name} for guid, type_name in upstream_refs
                    ],
                    "outputs": [
                        {
                            "guid": entity["id"],
                            "typeName": entity.get("entityType", "DataSet"),
                        }
                    ],
                },
            }
            process_entities.append(process_entity)

        if process_entities:
            self._client.ensure_transformation_type()
            self._client.bulk_create_or_update(process_entities)

        if is_full_sync:
            created_qns = {e["attributes"]["qualifiedName"] for e in process_entities}
            for model in models:
                qn = f"dbt://{model.get('unique_id', '')}"
                if qn in created_qns:
                    continue
                dep_nodes = model.get("depends_on", {}).get("nodes", [])
                if dep_nodes:
                    continue
                result = self._client.get_entity_by_qualified_name("dbt_transformation", qn)
                if result is not None and "entity" in result:
                    self._client.delete_entity_by_guid(result["entity"]["guid"])
                    logger.info(f"Purview: removed stale lineage {qn}")

    def _resolve_dependency_entity(
        self, dep_id: str, resolved: dict[str, PurviewEntityRef]
    ) -> PurviewEntityRef | None:
        """Resolve a dependency to a Purview entity.

        Handles model/seed/snapshot dependencies via the resolved cache, and source
        dependencies by looking them up in graph["sources"] and searching Purview.
        """
        if dep_id in resolved:
            return resolved[dep_id]

        if dep_id.startswith("source."):
            return self._resolve_source_entity(dep_id, resolved)

        dep_node = self._graph.get("nodes", {}).get(dep_id)
        if dep_node:
            cache_key = _make_cache_key(
                dep_node.get("database", ""),
                dep_node.get("schema", ""),
                dep_node.get("alias") or dep_node.get("name", ""),
            )
            return resolved.get(cache_key)

        return None

    def _resolve_source_entity(
        self, source_id: str, resolved: dict[str, PurviewEntityRef]
    ) -> PurviewEntityRef | None:
        """Resolve a dbt source to a Purview entity by searching on name and database."""
        sources = self._graph.get("sources", {})
        source = sources.get(source_id)
        if source is None:
            return None

        name = source.get("name", "")
        if not name:
            return None

        database = source.get("database", "")
        schema = source.get("schema", "")
        cache_key = _make_cache_key(database, schema, name)

        if cache_key in resolved:
            resolved[source_id] = resolved[cache_key]
            return resolved[cache_key]

        item = self._resolve_item(database) if database else None
        if not item:
            logger.info(f"Purview: no entity found for source {source_id}, skipping")
            return None

        db_ids = [item[1]]
        results = self._client.search_entities(name=name, database_identifiers=db_ids)

        if not results:
            logger.info(f"Purview: no entity found for source {source_id}, skipping")
            return None

        entity = self._pick_best_entity(results, db_ids)
        resolved[cache_key] = entity
        resolved[source_id] = entity
        return entity

    def _collect_test_results(
        self, models: list[dict], results: list | None
    ) -> dict[str, dict[str, str]]:
        """Extract test results from a dbt run, grouped by the model each test depends on.

        Results are RunResult objects with .node (a dataclass) and .status attributes.
        """
        if results is None:
            return {}

        test_results: dict[str, dict[str, str]] = {}

        for r in results:
            node = r.node
            if node.resource_type != "test":
                continue

            status = str(r.status)
            test_name = node.name

            dep_nodes = node.depends_on.nodes

            for dep_id in dep_nodes:
                if dep_id.startswith(("model.", "seed.", "snapshot.")):
                    test_results.setdefault(dep_id, {})[test_name] = status

        return test_results

    def _get_test_names_for_model(self, model_unique_id: str) -> list[str]:
        """Return the names of all tests that depend on the given model."""
        return self._test_mapping.get(model_unique_id, [])

    def _format_test_status(self, test_results: dict[str, str]) -> str:
        """Format test results as a summary string, e.g. 'all_passed' or '3/5 passed'."""
        if not test_results:
            return ""

        total = len(test_results)
        passed = sum(1 for s in test_results.values() if s == "pass")

        if passed == total:
            return "all_passed"
        return f"{passed}/{total} passed"
