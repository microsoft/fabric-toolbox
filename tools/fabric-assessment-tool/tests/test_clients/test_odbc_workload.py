from datetime import datetime
from types import SimpleNamespace

from fabric_assessment_tool.clients.odbc_client import OdbcClient


def test_query_history_maps_rows_and_redacts_command():
    client = object.__new__(OdbcClient)
    captured = {}

    def execute(query):
        captured["query"] = query
        return iter(
            [
                SimpleNamespace(
                    request_id="QID1",
                    session_id="SID1",
                    status="Completed",
                    resource_class="smallrc",
                    importance="normal",
                    submit_time=datetime(2026, 1, 1, 10),
                    start_time=datetime(2026, 1, 1, 10, 0, 1),
                    end_time=datetime(2026, 1, 1, 10, 0, 3),
                    duration_ms=2000,
                    queue_duration_ms=1000,
                    label="test",
                    login_name="user",
                    command="SELECT secret",
                )
            ]
        )

    client.execute_query = execute
    requests = client.get_query_history(7, 1000, include_sql_text=False)

    assert "TOP (1000)" in captured["query"]
    assert "DATEADD(day, -7" in captured["query"]
    assert "[command] AS command" not in captured["query"]
    assert requests[0].command is None
    assert "command" not in requests[0].json_response


def test_query_history_includes_command_only_when_requested():
    client = object.__new__(OdbcClient)
    captured = {}

    def execute(query):
        captured["query"] = query
        return iter(
            [
                SimpleNamespace(
                    request_id="QID1",
                    session_id="SID1",
                    status="Completed",
                    resource_class="smallrc",
                    importance="normal",
                    submit_time=None,
                    start_time=None,
                    end_time=None,
                    duration_ms=None,
                    queue_duration_ms=None,
                    label=None,
                    login_name="user",
                    command="SELECT 1",
                )
            ]
        )

    client.execute_query = execute
    requests = client.get_query_history(1, 10, include_sql_text=True)

    assert "[command] AS command" in captured["query"]
    assert requests[0].command == "SELECT 1"
    assert requests[0].json_response["command"] == "SELECT 1"


def test_session_history_maps_snapshot_rows():
    client = object.__new__(OdbcClient)
    client.execute_query = lambda query: iter(
        [
            SimpleNamespace(
                session_id="SID1",
                status="Active",
                login_name="user",
                login_time=datetime(2026, 1, 1, 10),
                query_count=3,
                client_id="client",
                app_name="app",
            )
        ]
    )

    sessions = client.get_session_history(7, 1000)

    assert sessions[0].session_id == "SID1"
    assert sessions[0].query_count == 3
