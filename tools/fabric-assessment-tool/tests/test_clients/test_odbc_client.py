"""Tests for OdbcClient serverless endpoint handling and activity collection."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from fabric_assessment_tool.clients.odbc_client import (
    OdbcClient,
    ServerlessActivityExpectedError,
)


def _build_serverless_client(**kwargs) -> OdbcClient:
    return OdbcClient(
        workspace_name="myworkspace",
        database="master",
        auth_mode="entra-default",
        endpoint_kind="serverless",
        **kwargs,
    )


class TestOdbcClientConnectionString:
    """Test connection string generation for different endpoint types."""

    def test_sql_auth_connection_string_uses_dedicated_endpoint_by_default(self):
        client = OdbcClient(
            workspace_name="myworkspace",
            database="mydb",
            username="sqladmin",
            password="secret123",
            auth_mode="sql",
        )

        assert (
            "Server=tcp:myworkspace.sql.azuresynapse.net,1433"
            in client._connection_string
        )
        assert "Database=mydb" in client._connection_string
        assert "Uid=sqladmin" in client._connection_string
        assert "Pwd=secret123" in client._connection_string

    def test_serverless_endpoint_uses_ondemand_hostname(self):
        client = OdbcClient(
            workspace_name="myworkspace",
            database="master",
            auth_mode="entra-default",
            endpoint_kind="serverless",
        )

        assert (
            "Server=tcp:myworkspace-ondemand.sql.azuresynapse.net,1433"
            in client._connection_string
        )
        assert "Authentication=ActiveDirectoryDefault" in client._connection_string

    def test_explicit_server_host_overrides_endpoint_kind(self):
        client = OdbcClient(
            workspace_name="ignored-workspace-name",
            database="master",
            auth_mode="entra-default",
            endpoint_kind="serverless",
            server_host="custom-host.sql.azuresynapse.net",
        )

        assert (
            "Server=tcp:custom-host.sql.azuresynapse.net,1433"
            in client._connection_string
        )


class TestOdbcClientValidation:
    """Test auth validation and serverless activity option validation."""

    def test_sql_auth_requires_username_and_password(self):
        with pytest.raises(ValueError, match="SQL authentication requires"):
            OdbcClient(
                workspace_name="myworkspace",
                database="mydb",
                auth_mode="sql",
                password="secret123",
            )

        with pytest.raises(ValueError, match="SQL authentication requires"):
            OdbcClient(
                workspace_name="myworkspace",
                database="mydb",
                auth_mode="sql",
                username="sqladmin",
            )

    def test_collect_serverless_activity_rejects_invalid_bounds(self):
        client = _build_serverless_client()

        with pytest.raises(ValueError, match="history_days"):
            client.collect_serverless_activity(history_days=0, top_n=1000)

        with pytest.raises(ValueError, match="top_n"):
            client.collect_serverless_activity(history_days=30, top_n=0)


class TestServerlessActivityCollection:
    """Test capability probing, fallback handling, and aggregation."""

    def test_collect_serverless_activity_classifies_tcp_timeout_as_unavailable(
        self, monkeypatch
    ):
        client = _build_serverless_client()

        def raise_timeout():
            raise Exception(
                "[Microsoft][ODBC Driver 18 for SQL Server]"
                "TCP Provider: Timeout error [258]."
            )

        monkeypatch.setattr(client, "_ensure_connection", raise_timeout)

        with pytest.raises(
            ServerlessActivityExpectedError, match="connection:.*Timeout error"
        ):
            client.collect_serverless_activity()

    def test_collect_serverless_activity_probes_sources_and_aggregates_results(
        self, monkeypatch
    ):
        client = _build_serverless_client()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        executed_queries = []

        source_columns = {
            "sys.dm_exec_requests_history": [
                "distributed_statement_id",
                "database_name",
                "login_name",
                "status",
                "start_time",
                "end_time",
                "total_elapsed_time_ms",
                "data_processed_mb",
                "command",
                "session_id",
                "row_count",
            ],
            "queryinsights.exec_requests_history": [
                "distributed_statement_id",
                "database_name",
                "login_name",
                "status",
                "submit_time",
                "start_time",
                "end_time",
                "total_elapsed_time_ms",
                "data_scanned_remote_storage_mb",
                "data_scanned_memory_mb",
                "data_scanned_disk_mb",
                "program_name",
                "session_id",
                "query_hash",
                "command",
            ],
        }

        def fake_get_query_columns(query, params=None):
            del params
            for source_name, columns in source_columns.items():
                if source_name in query:
                    return columns
            if "queryinsights.long_running_queries" in query:
                raise Exception(
                    "Invalid object name 'queryinsights.long_running_queries'"
                )
            if "queryinsights.frequently_run_queries" in query:
                raise Exception(
                    "Invalid object name 'queryinsights.frequently_run_queries'"
                )
            raise AssertionError(f"Unexpected probe query: {query}")

        def fake_execute_query(query, params=None):
            executed_queries.append((query, params))
            if "sys.dm_exec_requests_history" in query:
                if "GROUP BY" in query:
                    return iter(
                        [
                            SimpleNamespace(
                                activity_date=now.date(),
                                database_name="db1",
                                query_count=1,
                                processed_bytes=5242880,
                                total_elapsed_time_ms=1200,
                                max_elapsed_time_ms=1200,
                                success_count=1,
                                failure_count=0,
                                cancelled_count=0,
                                queries_last_24h=1,
                            )
                        ]
                    )
                return iter(
                    [
                        SimpleNamespace(
                            request_id="req-1",
                            session_id=11,
                            database_name="db1",
                            principal_name="alice@contoso.com",
                            status="Succeeded",
                            start_time=now - timedelta(hours=1),
                            end_time=now - timedelta(hours=1, seconds=-2),
                            elapsed_time_ms=1200,
                            processed_mb=5,
                            query_text="SELECT 1",
                            row_count=10,
                        ),
                        SimpleNamespace(
                            request_id="req-old",
                            session_id=13,
                            database_name="db-old",
                            principal_name="charlie@contoso.com",
                            status="Succeeded",
                            start_time=now - timedelta(days=31),
                            end_time=now - timedelta(days=31, seconds=-1),
                            elapsed_time_ms=900,
                            processed_mb=1,
                            query_text="SELECT old",
                            row_count=1,
                        ),
                    ]
                )
            if "queryinsights.exec_requests_history" in query:
                if "GROUP BY" in query:
                    return iter(
                        [
                            SimpleNamespace(
                                activity_date=now.date(),
                                database_name="db1",
                                query_count=1,
                                processed_bytes=5242880,
                                total_elapsed_time_ms=1200,
                                max_elapsed_time_ms=1200,
                                success_count=1,
                                failure_count=0,
                                cancelled_count=0,
                                queries_last_24h=1,
                            ),
                            SimpleNamespace(
                                activity_date=now.date(),
                                database_name="db2",
                                query_count=1,
                                processed_bytes=10485760,
                                total_elapsed_time_ms=3500,
                                max_elapsed_time_ms=3500,
                                success_count=0,
                                failure_count=1,
                                cancelled_count=0,
                                queries_last_24h=1,
                            ),
                        ]
                    )
                return iter(
                    [
                        SimpleNamespace(
                            request_id="req-1",
                            session_id=11,
                            database_name="db1",
                            principal_name="alice@contoso.com",
                            status="Succeeded",
                            submit_time=now - timedelta(hours=1, seconds=1),
                            start_time=now - timedelta(hours=1),
                            end_time=now - timedelta(hours=1, seconds=-2),
                            elapsed_time_ms=1200,
                            remote_processed_mb=2,
                            memory_processed_mb=1,
                            disk_processed_mb=2,
                            program_name="sqlcmd",
                            query_hash="hash-1",
                            query_text="SELECT 1",
                        ),
                        SimpleNamespace(
                            request_id="req-2",
                            session_id=12,
                            database_name="db2",
                            principal_name="bob@contoso.com",
                            status="Failed",
                            submit_time=now - timedelta(hours=2, seconds=1),
                            start_time=now - timedelta(hours=2),
                            end_time=now - timedelta(hours=2, seconds=-3),
                            elapsed_time_ms=3500,
                            remote_processed_mb=8,
                            memory_processed_mb=1,
                            disk_processed_mb=1,
                            program_name="Synapse Studio",
                            query_hash="hash-2",
                            query_text="SELECT 2",
                        ),
                    ]
                )
            return iter([])

        monkeypatch.setattr(client, "_ensure_connection", lambda: object())
        monkeypatch.setattr(client, "get_query_columns", fake_get_query_columns)
        monkeypatch.setattr(client, "execute_query", fake_execute_query)

        activity = client.collect_serverless_activity(history_days=30, top_n=10)

        assert activity.metadata.status == "completed"
        assert set(activity.metadata.available_sources) >= {
            "sys.dm_exec_requests_history",
            "queryinsights.exec_requests_history",
        }
        assert len(activity.queries) == 2
        assert activity.performance_summary.total_queries == 2
        assert activity.performance_summary.total_processed_bytes == 15728640
        assert activity.performance_summary.max_elapsed_time_ms == 3500
        assert activity.performance_summary.queries_last_24h == 2
        assert activity.performance_summary.top_slowest_queries[0].request_id == "req-2"
        assert not hasattr(
            activity.performance_summary.top_slowest_queries[0], "query_text"
        )

        query_lookup = {query.request_id: query for query in activity.queries}
        assert query_lookup["req-1"].program_name == "sqlcmd"
        assert query_lookup["req-1"].query_hash == "hash-1"
        assert query_lookup["req-1"].query_text == "SELECT 1"
        assert activity.database_summaries[0].database_name == "db2"
        detail_queries = [
            params
            for query, params in executed_queries
            if "GROUP BY" not in query and params
        ]
        assert detail_queries[0][1] == 10
        assert isinstance(executed_queries[0][1][0], datetime)

    def test_collect_serverless_activity_caps_details_not_aggregates(self, monkeypatch):
        client = _build_serverless_client()
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        monkeypatch.setattr(client, "_ensure_connection", lambda: object())
        monkeypatch.setattr(
            client,
            "get_query_columns",
            lambda query, params=None: (
                [
                    "distributed_statement_id",
                    "database_name",
                    "status",
                    "start_time",
                    "total_elapsed_time_ms",
                    "data_processed_bytes",
                ]
                if "sys.dm_exec_requests_history" in query
                else (_ for _ in ()).throw(Exception("Invalid object name"))
            ),
        )

        def fake_execute_query(query, params=None):
            if "GROUP BY" in query:
                return iter(
                    [
                        SimpleNamespace(
                            activity_date=now.date(),
                            database_name="db1",
                            query_count=1500,
                            processed_bytes=150000,
                            total_elapsed_time_ms=300000,
                            max_elapsed_time_ms=1000,
                            success_count=1500,
                            failure_count=0,
                            cancelled_count=0,
                            queries_last_24h=1500,
                        )
                    ]
                )
            return iter(
                [
                    SimpleNamespace(
                        request_id=f"req-{index}",
                        database_name="db1",
                        status="Succeeded",
                        start_time=now - timedelta(minutes=index),
                        elapsed_time_ms=200,
                        processed_bytes=100,
                    )
                    for index in range(1000)
                ]
            )

        monkeypatch.setattr(client, "execute_query", fake_execute_query)

        activity = client.collect_serverless_activity(history_days=30, top_n=1000)

        assert len(activity.queries) == 1000
        assert activity.performance_summary.total_queries == 1500
        assert activity.performance_summary.queries_last_24h == 1500
        assert activity.database_summaries[0].query_count == 1500

    def test_activity_aggregate_query_does_not_group_by_constant_database(self):
        client = _build_serverless_client()
        source = {
            "name": "sys.dm_exec_requests_history",
            "time_candidates": ("start_time",),
            "select_candidates": {
                "database_name": ("database_name",),
                "elapsed_time_ms": ("total_elapsed_time_ms",),
                "status": ("status",),
                "processed_bytes": ("data_processed_bytes",),
            },
        }

        query = client._build_activity_aggregate_query(
            source,
            ["start_time", "total_elapsed_time_ms", "status"],
        )

        group_by = query.split("GROUP BY", 1)[1].split("ORDER BY", 1)[0]
        assert "Unknown" not in group_by
        assert "CONVERT(date, [start_time])" in group_by

    def test_collect_serverless_activity_marks_partial_when_one_history_source_unavailable(
        self, monkeypatch
    ):
        client = _build_serverless_client()
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        def fake_get_query_columns(query, params=None):
            del params
            if "sys.dm_exec_requests_history" in query:
                return [
                    "distributed_statement_id",
                    "database_name",
                    "login_name",
                    "status",
                    "start_time",
                    "end_time",
                    "total_elapsed_time_ms",
                    "data_processed_mb",
                    "command",
                ]
            if "queryinsights.exec_requests_history" in query:
                raise Exception("The SELECT permission was denied on the object")
            return []

        def fake_execute_query(query, params=None):
            del query, params
            return iter(
                [
                    SimpleNamespace(
                        request_id="req-1",
                        database_name="db1",
                        principal_name="alice@contoso.com",
                        status="Succeeded",
                        start_time=now - timedelta(hours=1),
                        end_time=now - timedelta(hours=1, seconds=-1),
                        elapsed_time_ms=1000,
                        processed_mb=3,
                        query_text="SELECT 1",
                    )
                ]
            )

        monkeypatch.setattr(client, "_ensure_connection", lambda: object())
        monkeypatch.setattr(client, "get_query_columns", fake_get_query_columns)
        monkeypatch.setattr(client, "execute_query", fake_execute_query)

        activity = client.collect_serverless_activity(history_days=30, top_n=10)

        assert activity.metadata.status == "partial"
        assert "queryinsights.exec_requests_history" in activity.metadata.warnings[0]
        assert len(activity.queries) == 1

    def test_collect_serverless_activity_returns_unavailable_without_detailed_history(
        self, monkeypatch
    ):
        client = _build_serverless_client()
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        def fake_get_query_columns(query, params=None):
            del params
            if "sys.dm_exec_requests_history" in query:
                raise Exception("Invalid object name 'sys.dm_exec_requests_history'")
            if "queryinsights.exec_requests_history" in query:
                raise Exception(
                    "Invalid object name 'queryinsights.exec_requests_history'"
                )
            if "queryinsights.long_running_queries" in query:
                return [
                    "last_dist_statement_id",
                    "last_run_session_id",
                    "query_hash",
                    "last_run_start_time",
                    "last_run_total_elapsed_time_ms",
                ]
            if "queryinsights.frequently_run_queries" in query:
                return [
                    "last_dist_statement_id",
                    "last_run_session_id",
                    "query_hash",
                    "last_run_start_time",
                    "avg_total_elapsed_time_ms",
                ]
            return []

        def fake_execute_query(query, params=None):
            if "queryinsights.long_running_queries" in query:
                return iter(
                    [
                        SimpleNamespace(
                            request_id="supp-1",
                            session_id=22,
                            query_hash="slow-hash",
                            start_time=now - timedelta(hours=3),
                            elapsed_time_ms=8000,
                        )
                    ]
                )
            if "queryinsights.frequently_run_queries" in query:
                return iter(
                    [
                        SimpleNamespace(
                            request_id="supp-2",
                            session_id=23,
                            query_hash="freq-hash",
                            start_time=now - timedelta(hours=5),
                            elapsed_time_ms=2000,
                        )
                    ]
                )
            return iter([])

        monkeypatch.setattr(client, "_ensure_connection", lambda: object())
        monkeypatch.setattr(client, "get_query_columns", fake_get_query_columns)
        monkeypatch.setattr(client, "execute_query", fake_execute_query)

        activity = client.collect_serverless_activity(history_days=30, top_n=10)

        assert activity.metadata.status == "unavailable"
        assert (
            activity.performance_summary.top_slowest_queries[0].request_id == "supp-1"
        )
        assert not activity.queries
