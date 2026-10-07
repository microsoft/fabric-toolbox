from unittest.mock import Mock

from fabric_assessment_tool.assessment.synapse import (
    SynapseColumn,
    SynapseDedicatedDatabase,
    SynapseDedicatedPool,
    SynapseSchemas,
    SynapseSchema,
    SynapseServerlessDatabase,
    SynapseServerlessDatabases,
    SynapseServerlessPool,
    SynapseSqlPools,
    SynapseTable,
    SynapseTables,
    SynapseView,
    SynapseViews,
)
from fabric_assessment_tool.clients.odbc_client import (
    SynapseColumnMetadataObject,
    SynapseColumnMetadataResult,
    get_fabric_type_compatibility,
)
from fabric_assessment_tool.clients.synapse_client import SynapseClient


class FakeTokenProvider:
    def get_subscription_id(self):
        return "subscription"

    def get_token(self, scope):
        return "token"


def _client(**kwargs):
    return SynapseClient(token_provider=FakeTokenProvider(), **kwargs)


def _column(name, ordinal, data_type="int", nullable=False):
    compatibility = get_fabric_type_compatibility(data_type)
    return SynapseColumn(
        name=name,
        ordinal_position=ordinal,
        data_type=data_type,
        is_nullable=nullable,
        character_maximum_length=None,
        numeric_precision=None,
        numeric_scale=None,
        datetime_precision=None,
        column_default=None,
        character_set_name=None,
        collation_name=None,
        compatibility=compatibility.classification,
        compatibility_note=compatibility.note,
        json_response={},
    )


def _schema(database, table_name="existing_table", view_name=None):
    return SynapseSchema(
        name="dbo",
        database=database,
        tables=SynapseTables(
            tables=[
                SynapseTable(
                    name=table_name,
                    database=database,
                    schema="dbo",
                    statistics=None,
                    json_response={},
                )
            ]
        ),
        views=SynapseViews(
            views=(
                [
                    SynapseView(
                        name=view_name,
                        database=database,
                        schema="dbo",
                        json_response={},
                    )
                ]
                if view_name
                else []
            )
        ),
        json_response={},
    )


def _sql_pools():
    dedicated_database = SynapseDedicatedDatabase(
        name="dedicated_db",
        schemas=SynapseSchemas(schemas=[_schema("dedicated_db")]),
        json_response={},
    )
    dedicated_pool = SynapseDedicatedPool(
        name="dedicated_db",
        status="Online",
        sku="DW100c",
        database=dedicated_database,
        tables_count=1,
        size_gb=0,
        code_lines=[],
        code_objects=[],
        json_response={},
    )
    serverless_database = SynapseServerlessDatabase(
        name="serverless_db",
        source_provider="",
        origin_type="",
        schemas=SynapseSchemas(
            schemas=[_schema("serverless_db", view_name="existing_view")]
        ),
        json_response={},
    )
    return SynapseSqlPools(
        dedicated_pools=[dedicated_pool],
        serverless_pool=SynapseServerlessPool(
            name="Built-in",
            status="Online",
            queries_last_24h=0,
            databases=SynapseServerlessDatabases(databases=[serverless_database]),
            json_response={},
        ),
    )


def _metadata(objects, total=None, selected=None, capped=False):
    return SynapseColumnMetadataResult(
        objects=objects,
        total_objects=total if total is not None else len(objects),
        selected_objects=selected if selected is not None else len(objects),
        capped=capped,
    )


def test_dedicated_and_serverless_objects_receive_columns_and_summary(
    monkeypatch,
):
    client = _client()
    pools = _sql_pools()
    wide_columns = [
        _column(f"column_{index}", index, "varchar" if index == 1 else "int")
        for index in range(1, 101)
    ]
    results = {
        "dedicated_db": _metadata(
            [
                SynapseColumnMetadataObject(
                    schema="dbo",
                    object_type="table",
                    name="existing_table",
                    columns=[_column("id", 1), _column("payload", 2, "xml", True)],
                    columns_collected=True,
                ),
                SynapseColumnMetadataObject(
                    schema="dbo",
                    object_type="view",
                    name="dedicated_view",
                    columns=wide_columns,
                    columns_collected=True,
                ),
            ]
        ),
        "serverless_db": _metadata(
            [
                SynapseColumnMetadataObject(
                    schema="dbo",
                    object_type="table",
                    name="existing_table",
                    columns=[_column("id", 1)],
                    columns_collected=True,
                ),
                SynapseColumnMetadataObject(
                    schema="dbo",
                    object_type="view",
                    name="existing_view",
                    columns=[_column("name", 1, "nvarchar", True)],
                    columns_collected=True,
                ),
                SynapseColumnMetadataObject(
                    schema="dbo",
                    object_type="view",
                    name="odbc_only_view",
                    columns=[_column("created", 1, "datetime")],
                    columns_collected=True,
                ),
            ]
        ),
    }
    calls = []

    def collect(workspace, database, username, password):
        calls.append(database)
        return results[database]

    monkeypatch.setattr(client, "_get_or_collect_column_metadata", collect)

    summary = client._collect_column_metadata("workspace", pools, "user", "password")

    assert calls == ["dedicated_db", "serverless_db"]
    dedicated_schema = pools.dedicated_pools[0].database.schemas.schemas[0]
    assert [column.name for column in dedicated_schema.tables.tables[0].columns] == [
        "id",
        "payload",
    ]
    assert dedicated_schema.views.views[0].name == "dedicated_view"
    assert len(dedicated_schema.views.views[0].columns) == 100
    serverless_schema = pools.serverless_pool.databases.databases[0].schemas.schemas[0]
    assert serverless_schema.views.views[0].columns[0].name == "name"
    assert [view.name for view in serverless_schema.views.views] == [
        "existing_view",
        "odbc_only_view",
    ]
    assert summary.collection_status == "completed"
    assert summary.total_objects_collected == 5
    assert summary.total_columns == 105
    assert summary.nullable_columns == 2
    assert summary.compatibility_totals.compatible == 101
    assert summary.compatibility_totals.review == 3
    assert summary.compatibility_totals.unsupported == 1
    assert len(summary.wide_objects) == 1
    assert summary.wide_objects[0].name == "dedicated_view"


def test_unavailable_serverless_database_records_partial_without_losing_inventory(
    monkeypatch,
):
    client = _client()
    pools = _sql_pools()

    def collect(workspace, database, username, password):
        if database == "serverless_db":
            raise RuntimeError("network unavailable")
        return _metadata(
            [
                SynapseColumnMetadataObject(
                    schema="dbo",
                    object_type="table",
                    name="existing_table",
                    columns=[_column("id", 1)],
                    columns_collected=True,
                )
            ]
        )

    monkeypatch.setattr(client, "_get_or_collect_column_metadata", collect)

    summary = client._collect_column_metadata("workspace", pools, "user", "password")

    serverless_schema = pools.serverless_pool.databases.databases[0].schemas.schemas[0]
    assert len(serverless_schema.tables.tables) == 1
    assert len(serverless_schema.views.views) == 1
    assert summary.collection_status == "partial"
    assert summary.unavailable_databases == ["serverless_db"]
    assert summary.database_statuses[1].status == "unavailable"
    assert "network unavailable" in summary.database_statuses[1].reason


def test_skip_columns_runs_no_column_query():
    client = _client(skip_columns=True)
    client._get_or_collect_column_metadata = Mock(
        side_effect=AssertionError("column query should not run")
    )
    client._get_or_collect_table_view_objects = Mock(
        return_value=[
            SynapseColumnMetadataObject(
                schema="dbo",
                object_type="view",
                name="inventory_view",
                columns=[],
                columns_collected=False,
            )
        ]
    )
    pools = _sql_pools()

    summary = client._collect_column_metadata("workspace", pools, "user", "password")

    assert summary.collection_status == "skipped"
    assert summary.total_columns == 0
    assert all(status.status == "skipped" for status in summary.database_statuses)
    client._get_or_collect_column_metadata.assert_not_called()
    client._get_or_collect_table_view_objects.assert_called_once()
    assert (
        pools.dedicated_pools[0].database.schemas.schemas[0].views.views[0].name
        == "inventory_view"
    )


def test_cap_status_is_per_database_and_keeps_unselected_inventory(monkeypatch):
    client = _client(max_column_objects=2)
    pools = _sql_pools()

    def collect(workspace, database, username, password):
        objects = [
            SynapseColumnMetadataObject(
                schema="dbo",
                object_type="table",
                name="existing_table",
                columns=[_column("id", 1)],
                columns_collected=True,
            ),
            SynapseColumnMetadataObject(
                schema="dbo",
                object_type="view",
                name=f"{database}_selected_view",
                columns=[_column("id", 1)],
                columns_collected=True,
            ),
            SynapseColumnMetadataObject(
                schema="dbo",
                object_type="view",
                name=f"{database}_uncapped_view",
                columns=[],
                columns_collected=False,
            ),
        ]
        return _metadata(objects, total=3, selected=2, capped=True)

    monkeypatch.setattr(client, "_get_or_collect_column_metadata", collect)

    summary = client._collect_column_metadata("workspace", pools, "user", "password")

    assert summary.collection_status == "capped"
    assert summary.capped_databases == ["dedicated_db", "serverless_db"]
    assert [status.objects_collected for status in summary.database_statuses] == [
        2,
        2,
    ]
    dedicated_views = pools.dedicated_pools[0].database.schemas.schemas[0].views.views
    assert [view.name for view in dedicated_views] == [
        "dedicated_db_selected_view",
        "dedicated_db_uncapped_view",
    ]
    assert dedicated_views[1].columns == []


def test_successful_query_marks_database_partial_when_inventory_objects_are_missing(
    monkeypatch,
):
    client = _client()
    pools = _sql_pools()
    pools.dedicated_pools[0].database.schemas.schemas[0].tables.tables.append(
        SynapseTable(
            name="arm_only_table",
            database="dedicated_db",
            schema="dbo",
            statistics=None,
            json_response={},
        )
    )

    def collect(workspace, database, username, password):
        objects = [
            SynapseColumnMetadataObject(
                schema="dbo",
                object_type="table",
                name="existing_table",
                columns=[_column("id", 1)],
                columns_collected=True,
            )
        ]
        if database == "serverless_db":
            objects.append(
                SynapseColumnMetadataObject(
                    schema="dbo",
                    object_type="view",
                    name="existing_view",
                    columns=[_column("id", 1)],
                    columns_collected=True,
                )
            )
        return _metadata(objects)

    monkeypatch.setattr(client, "_get_or_collect_column_metadata", collect)

    summary = client._collect_column_metadata("workspace", pools, "user", "password")

    assert summary.collection_status == "partial"
    assert summary.partial_databases == ["dedicated_db"]
    dedicated_status = summary.database_statuses[0]
    assert dedicated_status.status == "partial"
    assert "not returned by INFORMATION_SCHEMA.COLUMNS" in dedicated_status.reason


def test_database_metadata_cache_executes_one_batch_query_per_database(monkeypatch):
    client = _client(max_column_objects=10)
    queried_databases = []

    class FakeOdbcClient:
        def __init__(self, database):
            self.database = database

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def get_column_metadata(self, max_objects):
            queried_databases.append((self.database, max_objects))
            return _metadata([])

    monkeypatch.setattr(
        client,
        "_create_odbc_client",
        lambda workspace_name, database_name, **kwargs: FakeOdbcClient(database_name),
    )

    first = client._get_or_collect_column_metadata(
        "workspace", "database_one", "user", "password"
    )
    second = client._get_or_collect_column_metadata(
        "workspace", "database_one", "user", "password"
    )
    client._get_or_collect_column_metadata(
        "workspace", "database_two", "user", "password"
    )

    assert first is second
    assert queried_databases == [
        ("database_one", 10),
        ("database_two", 10),
    ]
