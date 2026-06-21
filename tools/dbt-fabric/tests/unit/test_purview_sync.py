from types import SimpleNamespace
from unittest.mock import MagicMock

from dbt.adapters.fabric.purview_sync import (
    PurviewSync,
    _has_persist_docs_enabled,
    _make_cache_key,
    extract_syncable_models,
)


def _make_node(
    unique_id="model.test.my_model",
    name="my_model",
    alias=None,
    schema="dbo",
    database="my_db",
    resource_type="model",
    description="",
    columns=None,
    tags=None,
    meta=None,
    depends_on=None,
    config=None,
):
    return {
        "unique_id": unique_id,
        "name": name,
        "alias": alias,
        "schema": schema,
        "database": database,
        "resource_type": resource_type,
        "description": description,
        "columns": columns or {},
        "tags": tags or [],
        "meta": meta or {},
        "depends_on": depends_on or {"nodes": []},
        "config": config or {"materialized": "table"},
    }


def _make_test_node(name, depends_on_nodes):
    return {
        "unique_id": f"test.test.{name}",
        "name": name,
        "resource_type": "test",
        "depends_on": {"nodes": depends_on_nodes},
    }


def _make_source(
    unique_id="source.test.raw.orders",
    name="orders",
    schema="raw",
    database="my_db",
):
    return {
        "unique_id": unique_id,
        "name": name,
        "schema": schema,
        "database": database,
        "resource_type": "source",
    }


def _make_result(
    unique_id="model.test.my_model",
    resource_type="model",
    status="pass",
    depends_on_nodes=None,
):
    node = SimpleNamespace(
        unique_id=unique_id,
        resource_type=resource_type,
        name=unique_id.split(".")[-1],
        depends_on=SimpleNamespace(nodes=depends_on_nodes or []),
    )
    return SimpleNamespace(node=node, status=status)


def _make_purview_entity(
    guid="guid-1",
    name="my_model",
    entity_type="fabric_lakehouse_table",
    qualified_name="https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/my_model",
):
    return {
        "id": guid,
        "name": name,
        "entityType": entity_type,
        "qualifiedName": qualified_name,
    }


def _make_fabric_client(lakehouses=None, warehouses=None):
    client = MagicMock()
    client.get_lakehouses.return_value = lakehouses or [{"displayName": "my_db", "id": "b2c3d4e5"}]
    client.get_warehouses.return_value = warehouses or []
    return client


def _make_graph(nodes=None, sources=None):
    return {
        "nodes": nodes or {},
        "sources": sources or {},
    }


class TestExtractSyncableModels:
    def test_filters_by_resource_type(self):
        graph = {
            "nodes": {
                "model.test.a": _make_node(unique_id="model.test.a", resource_type="model"),
                "test.test.t": _make_node(unique_id="test.test.t", resource_type="test"),
                "seed.test.s": _make_node(unique_id="seed.test.s", resource_type="seed"),
                "snapshot.test.snap": _make_node(
                    unique_id="snapshot.test.snap", resource_type="snapshot"
                ),
                "source.test.src": _make_node(unique_id="source.test.src", resource_type="source"),
            }
        }
        models = extract_syncable_models(graph)
        ids = {m["unique_id"] for m in models}
        assert ids == {"model.test.a", "seed.test.s", "snapshot.test.snap"}

    def test_filters_by_results_when_provided(self):
        graph = {
            "nodes": {
                "model.test.a": _make_node(unique_id="model.test.a"),
                "model.test.b": _make_node(unique_id="model.test.b"),
            }
        }
        results = [_make_result(unique_id="model.test.a")]
        models = extract_syncable_models(graph, results)
        assert len(models) == 1
        assert models[0]["unique_id"] == "model.test.a"

    def test_no_results_returns_all(self):
        graph = {
            "nodes": {
                "model.test.a": _make_node(unique_id="model.test.a"),
                "model.test.b": _make_node(unique_id="model.test.b"),
            }
        }
        models = extract_syncable_models(graph, results=None)
        assert len(models) == 2

    def test_excludes_persist_docs_all_false(self):
        graph = {
            "nodes": {
                "model.test.a": _make_node(
                    unique_id="model.test.a",
                    config={
                        "materialized": "table",
                        "persist_docs": {"relation": False, "columns": False},
                    },
                ),
                "model.test.b": _make_node(
                    unique_id="model.test.b",
                    config={
                        "materialized": "table",
                        "persist_docs": {"relation": True, "columns": False},
                    },
                ),
            }
        }
        models = extract_syncable_models(graph)
        ids = {m["unique_id"] for m in models}
        assert ids == {"model.test.b"}

    def test_includes_when_persist_docs_not_set(self):
        graph = {
            "nodes": {
                "model.test.a": _make_node(
                    unique_id="model.test.a",
                    config={"materialized": "table"},
                ),
            }
        }
        models = extract_syncable_models(graph)
        assert len(models) == 1

    def test_excludes_ephemeral_models(self):
        graph = {
            "nodes": {
                "model.test.a": _make_node(
                    unique_id="model.test.a",
                    config={"materialized": "table"},
                ),
                "model.test.b": _make_node(
                    unique_id="model.test.b",
                    config={"materialized": "ephemeral"},
                ),
            }
        }
        models = extract_syncable_models(graph)
        ids = {m["unique_id"] for m in models}
        assert ids == {"model.test.a"}


class TestHasPersistDocsEnabled:
    def test_no_config(self):
        assert _has_persist_docs_enabled({"resource_type": "model"}) is True

    def test_no_persist_docs_key(self):
        assert _has_persist_docs_enabled({"config": {"materialized": "table"}}) is True

    def test_empty_persist_docs(self):
        assert _has_persist_docs_enabled({"config": {"persist_docs": {}}}) is True

    def test_all_false(self):
        node = {"config": {"persist_docs": {"relation": False, "columns": False}}}
        assert _has_persist_docs_enabled(node) is False

    def test_relation_true(self):
        node = {"config": {"persist_docs": {"relation": True, "columns": False}}}
        assert _has_persist_docs_enabled(node) is True

    def test_columns_true(self):
        node = {"config": {"persist_docs": {"relation": False, "columns": True}}}
        assert _has_persist_docs_enabled(node) is True

    def test_relation_false_only(self):
        node = {"config": {"persist_docs": {"relation": False}}}
        assert _has_persist_docs_enabled(node) is True


class TestMakeCacheKey:
    def test_lowercase(self):
        assert _make_cache_key("DB", "DBO", "Table") == "db.dbo.table"


class TestBuildTestMapping:
    def test_maps_tests_to_models(self):
        graph = _make_graph(
            nodes={
                "model.test.my_model": _make_node(),
                "test.test.not_null_id": _make_test_node("not_null_id", ["model.test.my_model"]),
                "test.test.unique_id": _make_test_node("unique_id", ["model.test.my_model"]),
            }
        )
        sync = PurviewSync(MagicMock(), _make_fabric_client(), graph)
        assert sorted(sync._get_test_names_for_model("model.test.my_model")) == [
            "not_null_id",
            "unique_id",
        ]

    def test_maps_tests_to_seeds(self):
        graph = _make_graph(
            nodes={
                "seed.test.raw_data": _make_node(
                    unique_id="seed.test.raw_data", resource_type="seed"
                ),
                "test.test.not_null_raw": _make_test_node("not_null_raw", ["seed.test.raw_data"]),
            }
        )
        sync = PurviewSync(MagicMock(), _make_fabric_client(), graph)
        assert sync._get_test_names_for_model("seed.test.raw_data") == ["not_null_raw"]

    def test_ignores_source_dependencies(self):
        graph = _make_graph(
            nodes={
                "test.test.src_test": _make_test_node("src_test", ["source.test.raw.orders"]),
            }
        )
        sync = PurviewSync(MagicMock(), _make_fabric_client(), graph)
        assert sync._get_test_names_for_model("source.test.raw.orders") == []

    def test_no_tests_returns_empty(self):
        graph = _make_graph(nodes={"model.test.my_model": _make_node()})
        sync = PurviewSync(MagicMock(), _make_fabric_client(), graph)
        assert sync._get_test_names_for_model("model.test.my_model") == []


class TestResolveEntities:
    def test_resolves_single_match(self):
        client = MagicMock()
        entity = _make_purview_entity()
        client.search_entities.return_value = [entity]

        sync = PurviewSync(client, _make_fabric_client(), _make_graph())
        node = _make_node()
        resolved = sync.resolve_entities([node])

        assert "model.test.my_model" in resolved
        assert "my_db.dbo.my_model" in resolved
        assert resolved["model.test.my_model"]["id"] == "guid-1"

    def test_disambiguates_multiple_matches(self):
        client = MagicMock()
        entity_a = _make_purview_entity(
            guid="guid-a",
            qualified_name="https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/other-id/tables/my_model",
        )
        entity_b = _make_purview_entity(
            guid="guid-b",
            qualified_name="https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/my_model",
        )
        client.search_entities.return_value = [entity_a, entity_b]

        sync = PurviewSync(client, _make_fabric_client(), _make_graph())
        node = _make_node()
        resolved = sync.resolve_entities([node])

        assert resolved["model.test.my_model"]["id"] == "guid-b"

    def test_skips_when_no_match_and_database_unknown(self):
        client = MagicMock()
        client.search_entities.return_value = []

        sync = PurviewSync(
            client, _make_fabric_client(lakehouses=[], warehouses=[]), _make_graph()
        )
        node = _make_node(database="unknown_db")
        resolved = sync.resolve_entities([node])

        assert len(resolved) == 0

    def test_creates_entity_when_no_match_but_database_known(self):
        client = MagicMock()
        client.search_entities.return_value = []
        client.bulk_create_or_update.return_value = {
            "mutatedEntities": {},
            "guidAssignments": {"-1": "new-guid"},
        }

        fabric_client = _make_fabric_client()
        fabric_client.get_workspace_id.return_value = "ws-id"
        sync = PurviewSync(client, fabric_client, _make_graph())
        node = _make_node()
        resolved = sync.resolve_entities([node])

        assert len(resolved) == 2  # unique_id + cache_key
        client.bulk_create_or_update.assert_called_once()

    def test_deduplicates_same_table(self):
        client = MagicMock()
        entity = _make_purview_entity()
        client.search_entities.return_value = [entity]

        sync = PurviewSync(client, _make_fabric_client(), _make_graph())
        node_a = _make_node(unique_id="model.test.my_model")
        node_b = _make_node(unique_id="model.other.my_model")
        sync.resolve_entities([node_a, node_b])

        client.search_entities.assert_called_once()


class TestPushMetadata:
    def test_pushes_description_via_bulk_when_persist_docs_relation(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(
            description="This model tracks user events",
            config={"materialized": "table", "persist_docs": {"relation": True, "columns": False}},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        client.bulk_create_or_update.assert_called_once()
        entities = client.bulk_create_or_update.call_args[0][0]
        assert len(entities) == 1
        assert entities[0]["attributes"]["userDescription"] == "This model tracks user events"
        assert entities[0]["typeName"] == "fabric_lakehouse_table"
        client.update_column_descriptions.assert_not_called()

    def test_syncs_description_when_persist_docs_not_set(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(description="This model tracks user events")
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        client.bulk_create_or_update.assert_called_once()
        entities = client.bulk_create_or_update.call_args[0][0]
        assert entities[0]["attributes"]["userDescription"] == "This model tracks user events"

    def test_skips_description_when_persist_docs_relation_false(self):
        client = MagicMock()
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(
            description="Has description but persist_docs is off",
            config={
                "materialized": "table",
                "persist_docs": {"relation": False, "columns": False},
            },
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        client.bulk_create_or_update.assert_not_called()

    def test_creates_column_entities_separately(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(
            columns={
                "user_id": {"name": "user_id", "description": "Primary key", "data_type": "int"},
                "email": {"name": "email", "description": "", "data_type": "string"},
            },
            config={
                "materialized": "table",
                "persist_docs": {"relation": False, "columns": True},
            },
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        client.bulk_create_or_update.assert_called_once()
        col_entities = client.bulk_create_or_update.call_args[0][0]
        assert len(col_entities) == 2
        described = [e for e in col_entities if "userDescription" in e["attributes"]]
        assert len(described) == 1
        assert described[0]["attributes"]["userDescription"] == "Primary key"

    def test_pushes_business_metadata_via_bulk(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(
            tags=["finance", "daily"],
            meta={"owner": "data-team"},
            config={"materialized": "incremental"},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=False, sync_metadata=True)

        client.bulk_create_or_update.assert_called_once()
        assert client.bulk_create_or_update.call_args[1]["merge_business_attrs"] is True

        entities = client.bulk_create_or_update.call_args[0][0]
        assert len(entities) == 1
        bm = entities[0]["businessAttributes"]["dbt_metadata"]
        assert bm["dbt_model_id"] == "model.test.my_model"
        assert bm.get("dbt_last_sync")
        assert bm["dbt_tags"] == "finance,daily"
        assert bm["dbt_materialization"] == "incremental"
        assert "owner" in bm["dbt_meta"]

    def test_sets_labels_from_tags(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(tags=["finance", "daily"])
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=False, sync_metadata=True)

        entities = client.bulk_create_or_update.call_args[0][0]
        assert entities[0]["labels"] == ["finance", "daily"]

    def test_no_labels_when_no_tags(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(tags=[])
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=False, sync_metadata=True)

        entities = client.bulk_create_or_update.call_args[0][0]
        assert "labels" not in entities[0]

    def test_includes_test_results_in_metadata(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node()
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        test_result = _make_result(
            unique_id="test.test.not_null_my_model_id",
            resource_type="test",
            status="pass",
            depends_on_nodes=["model.test.my_model"],
        )
        model_result = _make_result(unique_id="model.test.my_model")
        results = [model_result, test_result]

        sync.push_metadata([node], resolved, results, sync_descriptions=False, sync_metadata=True)

        entities = client.bulk_create_or_update.call_args[0][0]
        bm = entities[0]["businessAttributes"]["dbt_metadata"]
        assert bm["dbt_test_status"] == "all_passed"

    def test_includes_test_names_from_graph(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        graph = _make_graph(
            nodes={
                "model.test.my_model": _make_node(),
                "test.test.not_null_id": _make_test_node("not_null_id", ["model.test.my_model"]),
                "test.test.unique_id": _make_test_node("unique_id", ["model.test.my_model"]),
            }
        )
        sync = PurviewSync(client, _make_fabric_client(), graph)

        entity = _make_purview_entity()
        node = _make_node()
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=False, sync_metadata=True)

        entities = client.bulk_create_or_update.call_args[0][0]
        bm = entities[0]["businessAttributes"]["dbt_metadata"]
        test_names = set(bm["dbt_tests"].split(","))
        assert test_names == {"not_null_id", "unique_id"}

    def test_combined_descriptions_and_metadata(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(
            description="Full docs",
            columns={
                "user_id": {"name": "user_id", "description": "Primary key", "data_type": "int"}
            },
            tags=["finance"],
            config={
                "materialized": "table",
                "persist_docs": {"relation": True, "columns": True},
            },
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=True)

        assert client.bulk_create_or_update.call_count == 2
        table_entities = client.bulk_create_or_update.call_args_list[0][0][0]
        assert table_entities[0]["attributes"]["userDescription"] == "Full docs"
        assert "dbt_metadata" in table_entities[0]["businessAttributes"]
        assert table_entities[0]["labels"] == ["finance"]

        col_entities = client.bulk_create_or_update.call_args_list[1][0][0]
        assert len(col_entities) == 1
        assert col_entities[0]["attributes"]["userDescription"] == "Primary key"

    def test_no_merge_flag_when_descriptions_only(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(
            description="Desc",
            config={"materialized": "table", "persist_docs": {"relation": True}},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        assert client.bulk_create_or_update.call_args[1]["merge_business_attrs"] is False


class TestColumnEntityCreation:
    def test_creates_warehouse_column_entities(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity(
            entity_type="fabric_warehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/warehouses/wh/schemas/dbo/tables/fct_orders",
        )
        node = _make_node(
            columns={
                "id": {"name": "id", "description": "Primary key", "data_type": "int"},
                "name": {
                    "name": "name",
                    "description": "Display name",
                    "data_type": "varchar(100)",
                },
            },
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        bulk_calls = client.bulk_create_or_update.call_args_list
        column_call = [
            c
            for c in bulk_calls
            if any(e.get("typeName") == "fabric_warehouse_table_column" for e in c[0][0])
        ]
        assert len(column_call) == 1
        col_entities = column_call[0][0][0]
        assert all(e["typeName"] == "fabric_warehouse_table_column" for e in col_entities)

    def test_warehouse_columns_have_data_type(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity(
            entity_type="fabric_warehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/warehouses/wh/schemas/dbo/tables/t",
        )
        node = _make_node(
            columns={"id": {"name": "id", "description": "", "data_type": "bigint"}},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        bulk_calls = client.bulk_create_or_update.call_args_list
        col_entities = []
        for c in bulk_calls:
            for e in c[0][0]:
                if e.get("typeName") == "fabric_warehouse_table_column":
                    col_entities.append(e)
        assert len(col_entities) == 1
        assert col_entities[0]["attributes"]["data_type"] == "bigint"

    def test_creates_lakehouse_column_entities(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity(
            entity_type="fabric_lakehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/lakehouses/lh/tables/fct_orders",
        )
        node = _make_node(
            columns={
                "id": {"name": "id", "description": "Primary key", "data_type": "int"},
            },
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        bulk_calls = client.bulk_create_or_update.call_args_list
        col_entities = []
        for c in bulk_calls:
            for e in c[0][0]:
                if e.get("typeName") == "fabric_lakehouse_table_column":
                    col_entities.append(e)
        assert len(col_entities) == 1
        assert col_entities[0]["attributes"]["dataType"] == "int"

    def test_column_descriptions_set_on_creation(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity(
            entity_type="fabric_lakehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/lakehouses/lh/tables/t",
        )
        node = _make_node(
            columns={"id": {"name": "id", "description": "The primary key", "data_type": "int"}},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        bulk_calls = client.bulk_create_or_update.call_args_list
        col_entities = []
        for c in bulk_calls:
            for e in c[0][0]:
                if "column" in e.get("typeName", ""):
                    col_entities.append(e)
        assert len(col_entities) == 1
        assert col_entities[0]["attributes"]["userDescription"] == "The primary key"

    def test_column_qualified_name_pattern(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity(
            entity_type="fabric_lakehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/lakehouses/lh/tables/t",
        )
        node = _make_node(
            columns={"user_id": {"name": "user_id", "description": "", "data_type": "string"}},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        bulk_calls = client.bulk_create_or_update.call_args_list
        col_entities = []
        for c in bulk_calls:
            for e in c[0][0]:
                if "column" in e.get("typeName", ""):
                    col_entities.append(e)
        assert len(col_entities) == 1
        assert col_entities[0]["attributes"]["qualifiedName"] == (
            "https://app.fabric.microsoft.com/groups/ws/lakehouses/lh/tables/t/columns/user_id"
        )

    def test_no_columns_skips_creation(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(columns={}, description="Has description but no columns")
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        if client.bulk_create_or_update.called:
            for call in client.bulk_create_or_update.call_args_list:
                for e in call[0][0]:
                    assert "column" not in e.get("typeName", "")

    def test_catalog_columns_included_without_yaml(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        catalog_columns = {
            "model.test.my_model": [
                ("id", "int"),
                ("name", "varchar(100)"),
                ("created_at", "datetime2(6)"),
            ],
        }
        sync = PurviewSync(
            client, _make_fabric_client(), _make_graph(), catalog_columns=catalog_columns
        )

        entity = _make_purview_entity(
            entity_type="fabric_warehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/warehouses/wh/schemas/dbo/tables/t",
        )
        node = _make_node(columns={})
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        col_entities = []
        for c in client.bulk_create_or_update.call_args_list:
            for e in c[0][0]:
                if "column" in e.get("typeName", ""):
                    col_entities.append(e)
        assert len(col_entities) == 3
        col_names = {e["attributes"]["name"] for e in col_entities}
        assert col_names == {"id", "name", "created_at"}
        assert col_entities[2]["attributes"]["data_type"] == "datetime2(6)"

    def test_catalog_columns_with_yaml_descriptions(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        catalog_columns = {
            "model.test.my_model": [
                ("id", "int"),
                ("name", "varchar(100)"),
                ("status", "varchar(20)"),
            ],
        }
        sync = PurviewSync(
            client, _make_fabric_client(), _make_graph(), catalog_columns=catalog_columns
        )

        entity = _make_purview_entity(
            entity_type="fabric_warehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/warehouses/wh/schemas/dbo/tables/t",
        )
        node = _make_node(
            columns={
                "id": {"name": "id", "description": "Primary key", "data_type": "int"},
                "name": {"name": "name", "description": "Display name", "data_type": "varchar"},
            },
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        col_entities = []
        for c in client.bulk_create_or_update.call_args_list:
            for e in c[0][0]:
                if "column" in e.get("typeName", ""):
                    col_entities.append(e)
        assert len(col_entities) == 3

        by_name = {e["attributes"]["name"]: e for e in col_entities}
        assert by_name["id"]["attributes"].get("userDescription") == "Primary key"
        assert by_name["id"]["attributes"]["data_type"] == "int"
        assert by_name["name"]["attributes"].get("userDescription") == "Display name"
        assert by_name["name"]["attributes"]["data_type"] == "varchar(100)"
        assert "userDescription" not in by_name["status"]["attributes"]


class TestPushLineage:
    def test_creates_process_entities(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        upstream = _make_purview_entity(guid="guid-upstream", name="source_table")
        downstream = _make_purview_entity(guid="guid-downstream", name="my_model")

        node = _make_node(
            depends_on={"nodes": ["model.test.source_table"]},
        )

        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
            "model.test.source_table": upstream,
        }

        sync.push_lineage([node], resolved)

        client.bulk_create_or_update.assert_called_once()
        entities = client.bulk_create_or_update.call_args[0][0]
        assert len(entities) == 1
        process = entities[0]
        assert process["typeName"] == "dbt_transformation"
        assert process["attributes"]["qualifiedName"] == "dbt://model.test.my_model"
        assert len(process["attributes"]["inputs"]) == 1
        assert process["attributes"]["inputs"][0]["guid"] == "guid-upstream"
        assert process["attributes"]["inputs"][0]["typeName"] == "fabric_lakehouse_table"
        assert len(process["attributes"]["outputs"]) == 1
        assert process["attributes"]["outputs"][0]["guid"] == "guid-downstream"
        assert process["attributes"]["outputs"][0]["typeName"] == "fabric_lakehouse_table"

    def test_resolves_source_dependencies(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}

        source_entity = _make_purview_entity(
            guid="guid-source",
            name="orders",
            qualified_name="https://app.fabric.microsoft.com/groups/a1b2c3d4/lakehouses/b2c3d4e5/tables/orders",
        )
        client.search_entities.return_value = [source_entity]

        graph = _make_graph(
            sources={
                "source.test.raw.orders": _make_source(),
            }
        )
        sync = PurviewSync(client, _make_fabric_client(), graph)

        downstream = _make_purview_entity(guid="guid-downstream", name="my_model")
        node = _make_node(
            depends_on={"nodes": ["source.test.raw.orders"]},
        )
        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
        }

        sync.push_lineage([node], resolved)

        client.search_entities.assert_called_once_with(
            name="orders", database_identifiers=["b2c3d4e5"]
        )
        client.bulk_create_or_update.assert_called_once()
        entities = client.bulk_create_or_update.call_args[0][0]
        assert entities[0]["attributes"]["inputs"][0]["guid"] == "guid-source"

    def test_source_resolution_is_cached(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}

        source_entity = _make_purview_entity(guid="guid-source", name="orders")
        client.search_entities.return_value = [source_entity]

        graph = _make_graph(
            sources={
                "source.test.raw.orders": _make_source(),
            }
        )
        sync = PurviewSync(client, _make_fabric_client(), graph)

        downstream_a = _make_purview_entity(guid="guid-a", name="model_a")
        downstream_b = _make_purview_entity(guid="guid-b", name="model_b")
        node_a = _make_node(
            unique_id="model.test.model_a",
            name="model_a",
            depends_on={"nodes": ["source.test.raw.orders"]},
        )
        node_b = _make_node(
            unique_id="model.test.model_b",
            name="model_b",
            depends_on={"nodes": ["source.test.raw.orders"]},
        )
        resolved = {
            "model.test.model_a": downstream_a,
            "my_db.dbo.model_a": downstream_a,
            "model.test.model_b": downstream_b,
            "my_db.dbo.model_b": downstream_b,
        }

        sync.push_lineage([node_a, node_b], resolved)

        client.search_entities.assert_called_once()

    def test_skips_when_source_not_in_graph(self):
        client = MagicMock()
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        downstream = _make_purview_entity()
        node = _make_node(
            depends_on={"nodes": ["source.test.raw.unknown"]},
        )
        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
        }

        sync.push_lineage([node], resolved)

        client.bulk_create_or_update.assert_not_called()

    def test_skips_source_when_database_unresolvable(self):
        client = MagicMock()
        graph = _make_graph(
            sources={
                "source.test.raw.orders": _make_source(database="unknown_db"),
            }
        )
        sync = PurviewSync(
            client,
            _make_fabric_client(lakehouses=[], warehouses=[]),
            graph,
        )

        downstream = _make_purview_entity()
        node = _make_node(
            depends_on={"nodes": ["source.test.raw.orders"]},
        )
        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
        }

        sync.push_lineage([node], resolved)

        client.search_entities.assert_not_called()
        client.bulk_create_or_update.assert_not_called()

    def test_skips_when_no_upstream_resolved(self):
        client = MagicMock()
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        downstream = _make_purview_entity()
        node = _make_node(
            depends_on={"nodes": ["model.test.unknown"]},
        )

        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
        }

        sync.push_lineage([node], resolved)

        client.bulk_create_or_update.assert_not_called()

    def test_skips_when_no_depends_on(self):
        client = MagicMock()
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = _make_node(depends_on={"nodes": []})
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_lineage([node], resolved)

        client.bulk_create_or_update.assert_not_called()

    def test_full_sync_does_not_delete_lineage_for_models_with_deps(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        upstream = _make_purview_entity(guid="guid-upstream", name="source_table")
        downstream = _make_purview_entity(guid="guid-downstream", name="my_model")
        node = _make_node(depends_on={"nodes": ["model.test.source_table"]})
        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
            "model.test.source_table": upstream,
        }

        sync.push_lineage([node], resolved, is_full_sync=True)

        client.get_entity_by_qualified_name.assert_not_called()
        client.delete_entity_by_guid.assert_not_called()

    def test_full_sync_deletes_stale_lineage_for_models_without_deps(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        client.get_entity_by_qualified_name.return_value = {
            "entity": {"guid": "proc-stale", "typeName": "dbt_transformation"}
        }
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        removed_node = _make_node(
            unique_id="model.test.removed_model",
            name="removed_model",
            depends_on={"nodes": []},
        )
        resolved = {}

        sync.push_lineage([removed_node], resolved, is_full_sync=True)

        client.get_entity_by_qualified_name.assert_called_once_with(
            "dbt_transformation", "dbt://model.test.removed_model"
        )
        client.delete_entity_by_guid.assert_called_once_with("proc-stale")

    def test_resolves_dependency_via_graph_node(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}

        upstream_node = _make_node(
            unique_id="model.test.upstream",
            name="upstream",
            schema="dbo",
            database="my_db",
        )
        graph = _make_graph(nodes={"model.test.upstream": upstream_node})
        sync = PurviewSync(client, _make_fabric_client(), graph)

        upstream_entity = _make_purview_entity(guid="guid-upstream", name="upstream")
        downstream_entity = _make_purview_entity(guid="guid-downstream", name="downstream")
        node = _make_node(
            unique_id="model.test.downstream",
            name="downstream",
            depends_on={"nodes": ["model.test.upstream"]},
        )
        resolved = {
            "model.test.downstream": downstream_entity,
            "my_db.dbo.downstream": downstream_entity,
            "my_db.dbo.upstream": upstream_entity,
        }

        sync.push_lineage([node], resolved)

        client.bulk_create_or_update.assert_called_once()
        entities = client.bulk_create_or_update.call_args[0][0]
        assert entities[0]["attributes"]["inputs"][0]["guid"] == "guid-upstream"


class TestResolveItemType:
    def test_lakehouse_database(self):
        sync = PurviewSync(
            MagicMock(),
            _make_fabric_client(lakehouses=[{"displayName": "my_lh", "id": "lh-id"}]),
            _make_graph(),
        )
        item_type, item_id = sync._resolve_item("my_lh")
        assert item_type == "lakehouse"
        assert item_id == "lh-id"

    def test_warehouse_database(self):
        sync = PurviewSync(
            MagicMock(),
            _make_fabric_client(
                lakehouses=[],
                warehouses=[{"displayName": "my_dwh", "id": "wh-id"}],
            ),
            _make_graph(),
        )
        item_type, item_id = sync._resolve_item("my_dwh")
        assert item_type == "warehouse"
        assert item_id == "wh-id"

    def test_case_insensitive_match(self):
        sync = PurviewSync(
            MagicMock(),
            _make_fabric_client(lakehouses=[{"displayName": "My_Lakehouse", "id": "lh-id"}]),
            _make_graph(),
        )
        item_type, item_id = sync._resolve_item("my_lakehouse")
        assert item_type == "lakehouse"
        assert item_id == "lh-id"

    def test_unknown_database_returns_none(self):
        sync = PurviewSync(
            MagicMock(),
            _make_fabric_client(lakehouses=[], warehouses=[]),
            _make_graph(),
        )
        result = sync._resolve_item("unknown_db")
        assert result is None

    def test_caches_result(self):
        fabric_client = _make_fabric_client(lakehouses=[{"displayName": "my_lh", "id": "lh-id"}])
        sync = PurviewSync(MagicMock(), fabric_client, _make_graph())
        sync._resolve_item("my_lh")
        sync._resolve_item("my_lh")
        fabric_client.get_lakehouses.assert_called_once()


class TestCreateEntityForModel:
    def _make_bulk_response(self, guid, qualified_name):
        return {
            "mutatedEntities": {},
            "guidAssignments": {"-1": guid},
        }

    def test_creates_warehouse_table_entity(self):
        table_qn = "https://app.fabric.microsoft.com/groups/ws-id/warehouses/wh-id/schemas/dbo/tables/fct_orders"
        client = MagicMock()
        client.search_entities.return_value = []
        client.bulk_create_or_update.return_value = self._make_bulk_response(
            "table-guid", table_qn
        )

        fabric_client = _make_fabric_client(
            lakehouses=[], warehouses=[{"displayName": "my_dwh", "id": "wh-id"}]
        )
        fabric_client.get_workspace_id.return_value = "ws-id"

        sync = PurviewSync(client, fabric_client, _make_graph())
        node = _make_node(database="my_dwh", schema="dbo", name="fct_orders")
        resolved = sync.resolve_entities([node])

        assert "model.test.my_model" in resolved
        entity = resolved["model.test.my_model"]
        assert entity["entityType"] == "fabric_warehouse_table"
        assert entity["id"] == "table-guid"
        assert "fct_orders" in entity["qualifiedName"]

    def test_warehouse_entities_created_sequentially(self):
        table_qn = "https://app.fabric.microsoft.com/groups/ws-id/warehouses/wh-id/schemas/dbo/tables/fct_orders"
        client = MagicMock()
        client.search_entities.return_value = []
        client.bulk_create_or_update.return_value = self._make_bulk_response(
            "table-guid", table_qn
        )

        fabric_client = _make_fabric_client(
            lakehouses=[], warehouses=[{"displayName": "my_dwh", "id": "wh-id"}]
        )
        fabric_client.get_workspace_id.return_value = "ws-id"

        sync = PurviewSync(client, fabric_client, _make_graph())
        node = _make_node(database="my_dwh", schema="dbo", name="fct_orders")
        sync.resolve_entities([node])

        assert client.bulk_create_or_update.call_count == 3
        all_entities = [call[0][0][0] for call in client.bulk_create_or_update.call_args_list]
        type_names = [e["typeName"] for e in all_entities]
        assert type_names == [
            "fabric_warehouse",
            "fabric_warehouse_schema",
            "fabric_warehouse_table",
        ]

        wh_entity = all_entities[0]
        assert wh_entity["attributes"]["qualifiedName"] == (
            "https://app.fabric.microsoft.com/groups/ws-id/warehouses/wh-id"
        )
        assert "dbo" in all_entities[1]["attributes"]["qualifiedName"]
        assert "fct_orders" in all_entities[2]["attributes"]["qualifiedName"]

    def test_creates_lakehouse_table_entity(self):
        table_qn = (
            "https://app.fabric.microsoft.com/groups/ws-id/lakehouses/lh-id"
            "/tables/dbo%252Ffct_orders"
        )
        client = MagicMock()
        client.search_entities.return_value = []
        client.bulk_create_or_update.return_value = self._make_bulk_response(
            "table-guid", table_qn
        )

        fabric_client = _make_fabric_client(lakehouses=[{"displayName": "my_lh", "id": "lh-id"}])
        fabric_client.get_workspace_id.return_value = "ws-id"

        sync = PurviewSync(client, fabric_client, _make_graph())
        node = _make_node(database="my_lh", schema="dbo", name="fct_orders")
        resolved = sync.resolve_entities([node])

        assert "model.test.my_model" in resolved
        entity = resolved["model.test.my_model"]
        assert entity["entityType"] == "fabric_lakehouse_table"
        assert entity["id"] == "table-guid"

        assert client.bulk_create_or_update.call_count == 1
        entities = client.bulk_create_or_update.call_args_list[0][0][0]
        assert len(entities) == 1
        assert entities[0]["typeName"] == "fabric_lakehouse_table"
        assert entities[0]["attributes"]["qualifiedName"] == table_qn

    def test_skips_when_database_not_found(self):
        client = MagicMock()
        client.search_entities.return_value = []

        fabric_client = _make_fabric_client(lakehouses=[], warehouses=[])
        sync = PurviewSync(client, fabric_client, _make_graph())
        node = _make_node(database="unknown", schema="dbo", name="fct_orders")
        resolved = sync.resolve_entities([node])

        assert len(resolved) == 0
        client.bulk_create_or_update.assert_not_called()

    def test_existing_entity_not_recreated(self):
        """When search finds an existing entity, don't create a new one."""
        client = MagicMock()
        existing = _make_purview_entity(guid="existing-guid")
        client.search_entities.return_value = [existing]

        fabric_client = _make_fabric_client(
            lakehouses=[{"displayName": "my_db", "id": "b2c3d4e5"}]
        )
        sync = PurviewSync(client, fabric_client, _make_graph())
        node = _make_node()
        resolved = sync.resolve_entities([node])

        assert resolved["model.test.my_model"]["id"] == "existing-guid"
        client.bulk_create_or_update.assert_not_called()


class TestFormatTestStatus:
    def test_all_passed(self):
        sync = PurviewSync(MagicMock(), _make_fabric_client(), _make_graph())
        assert sync._format_test_status({"t1": "pass", "t2": "pass"}) == "all_passed"

    def test_partial_pass(self):
        sync = PurviewSync(MagicMock(), _make_fabric_client(), _make_graph())
        assert sync._format_test_status({"t1": "pass", "t2": "fail"}) == "1/2 passed"

    def test_empty(self):
        sync = PurviewSync(MagicMock(), _make_fabric_client(), _make_graph())
        assert sync._format_test_status({}) == ""

    def test_none_values_in_results(self):
        sync = PurviewSync(MagicMock(), _make_fabric_client(), _make_graph())
        result = sync._format_test_status({"t1": None, "t2": "pass", "t3": None})
        assert result == "1/3 passed"


class TestExtractSyncableModelsEdgeCases:
    def test_empty_graph(self):
        models = extract_syncable_models({})
        assert models == []

    def test_node_missing_config_key(self):
        node = {
            "unique_id": "model.test.no_config",
            "name": "no_config",
            "resource_type": "model",
        }
        graph = {"nodes": {"model.test.no_config": node}}
        models = extract_syncable_models(graph)
        assert len(models) == 1
        assert models[0]["unique_id"] == "model.test.no_config"


class TestResolveEntitiesEdgeCases:
    def test_skips_model_with_empty_name_and_alias(self):
        client = MagicMock()
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())
        node = _make_node(name="", alias="")
        resolved = sync.resolve_entities([node])
        assert len(resolved) == 0
        client.search_entities.assert_not_called()

    def test_skips_model_when_entity_creation_returns_none(self):
        client = MagicMock()
        client.search_entities.return_value = []

        fabric_client = _make_fabric_client(lakehouses=[], warehouses=[])
        sync = PurviewSync(client, fabric_client, _make_graph())
        node = _make_node(database="unknown_db")
        resolved = sync.resolve_entities([node])

        assert len(resolved) == 0


class TestPushMetadataEdgeCases:
    def test_model_missing_description_and_config(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity()
        node = {
            "unique_id": "model.test.bare",
            "name": "bare",
            "schema": "dbo",
            "database": "my_db",
            "resource_type": "model",
            "columns": {},
            "tags": [],
            "meta": {},
            "depends_on": {"nodes": []},
        }
        resolved = {"model.test.bare": entity, "my_db.dbo.bare": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=True)

        client.bulk_create_or_update.assert_called_once()
        entities = client.bulk_create_or_update.call_args[0][0]
        assert len(entities) == 1
        assert "userDescription" not in entities[0]["attributes"]
        bm = entities[0]["businessAttributes"]["dbt_metadata"]
        assert bm["dbt_model_id"] == "model.test.bare"


class TestBuildColumnEntitiesEdgeCases:
    def test_warehouse_column_missing_data_type_falls_back_to_unknown(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity(
            entity_type="fabric_warehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/warehouses/wh/schemas/dbo/tables/t",
        )
        node = _make_node(
            columns={"id": {"name": "id", "description": "Primary key", "data_type": ""}},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        col_entities = []
        for c in client.bulk_create_or_update.call_args_list:
            for e in c[0][0]:
                if e.get("typeName") == "fabric_warehouse_table_column":
                    col_entities.append(e)
        assert len(col_entities) == 1
        assert col_entities[0]["attributes"]["data_type"] == "unknown"

    def test_lakehouse_column_missing_data_type_falls_back_to_unknown(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        entity = _make_purview_entity(
            entity_type="fabric_lakehouse_table",
            qualified_name="https://app.fabric.microsoft.com/groups/ws/lakehouses/lh/tables/t",
        )
        node = _make_node(
            columns={"id": {"name": "id", "description": "", "data_type": ""}},
        )
        resolved = {"model.test.my_model": entity, "my_db.dbo.my_model": entity}

        sync.push_metadata([node], resolved, sync_descriptions=True, sync_metadata=False)

        col_entities = []
        for c in client.bulk_create_or_update.call_args_list:
            for e in c[0][0]:
                if e.get("typeName") == "fabric_lakehouse_table_column":
                    col_entities.append(e)
        assert len(col_entities) == 1
        assert col_entities[0]["attributes"]["dataType"] == "unknown"


class TestPushLineageEdgeCases:
    def test_partial_upstream_resolution_creates_process_with_remaining(self):
        client = MagicMock()
        client.bulk_create_or_update.return_value = {"mutatedEntities": {}, "guidAssignments": {}}
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        upstream = _make_purview_entity(guid="guid-upstream", name="known_table")
        downstream = _make_purview_entity(guid="guid-downstream", name="my_model")

        node = _make_node(
            depends_on={"nodes": ["model.test.known_table", "model.test.unknown_table"]},
        )

        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
            "model.test.known_table": upstream,
        }

        sync.push_lineage([node], resolved)

        client.bulk_create_or_update.assert_called_once()
        entities = client.bulk_create_or_update.call_args[0][0]
        assert len(entities) == 1
        process = entities[0]
        assert len(process["attributes"]["inputs"]) == 1
        assert process["attributes"]["inputs"][0]["guid"] == "guid-upstream"

    def test_no_upstream_resolved_skips_model(self):
        client = MagicMock()
        sync = PurviewSync(client, _make_fabric_client(), _make_graph())

        downstream = _make_purview_entity(guid="guid-downstream", name="my_model")
        node = _make_node(
            depends_on={"nodes": ["model.test.unknown_a", "model.test.unknown_b"]},
        )
        resolved = {
            "model.test.my_model": downstream,
            "my_db.dbo.my_model": downstream,
        }

        sync.push_lineage([node], resolved)

        client.bulk_create_or_update.assert_not_called()


class TestResolveSourceEntityEdgeCases:
    def test_source_database_not_resolvable_returns_none(self):
        client = MagicMock()
        graph = _make_graph(
            sources={
                "source.test.raw.orders": _make_source(database="nonexistent_db"),
            }
        )
        sync = PurviewSync(
            client,
            _make_fabric_client(lakehouses=[], warehouses=[]),
            graph,
        )

        result = sync._resolve_source_entity("source.test.raw.orders", {})

        assert result is None
        client.search_entities.assert_not_called()
