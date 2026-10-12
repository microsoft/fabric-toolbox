from unittest.mock import Mock

from fabric_assessment_tool.assessment.synapse import (
    SynapseDedicatedDatabase,
    SynapseDedicatedPool,
    SynapseQueryActivity,
    SynapseSchemas,
)
from fabric_assessment_tool.clients.synapse_client import SynapseClient


def pool(status="Online"):
    return SynapseDedicatedPool(
        name="pool1",
        status=status,
        sku="DW100c",
        database=SynapseDedicatedDatabase("pool1", SynapseSchemas([]), {}),
        tables_count=0,
        size_gb=0,
        code_lines=[],
        code_objects=[],
        json_response={},
    )


def client():
    result = object.__new__(SynapseClient)
    result.query_history_days = 7
    result.query_history_top = 1000
    result.include_sql_text = False
    result.skip_query_history = False
    result.sql_auth_mode = "entra-default"
    result.sql_client_id = None
    result.sql_client_secret = None
    result.paused_databases = []
    return result


def test_collects_workload_profile():
    synapse_client = client()
    odbc = Mock()
    odbc.get_query_history.return_value = [
        SynapseQueryActivity(
            "Q1",
            "S1",
            "Completed",
            "smallrc",
            "normal",
            "2026-01-01T10:00:00",
            "2026-01-01T10:00:00",
            "2026-01-01T10:00:01",
            1000,
            0,
            None,
            "user",
            None,
            {},
        )
    ]
    odbc.get_session_history.return_value = []
    synapse_client._create_odbc_client = Mock(return_value=odbc)

    profile = synapse_client._get_dedicated_pool_workload(
        "workspace", pool(), None, "__entra_auth__"
    )

    assert profile.collection_status == "collected"
    assert profile.request_count == 1
    odbc.get_query_history.assert_called_once_with(
        history_days=7, top_n=1000, include_sql_text=False
    )


def test_skip_query_history_returns_explicit_skipped_profile():
    synapse_client = client()
    synapse_client.skip_query_history = True

    profile = synapse_client._get_dedicated_pool_workload(
        "workspace", pool(), None, "__entra_auth__"
    )

    assert profile.collection_status == "skipped"
    assert "--skip-query-history" in profile.description


def test_permission_failure_returns_unavailable_profile():
    synapse_client = client()
    odbc = Mock()
    odbc.get_query_history.side_effect = RuntimeError("permission denied")
    synapse_client._create_odbc_client = Mock(return_value=odbc)

    profile = synapse_client._get_dedicated_pool_workload(
        "workspace", pool(), None, "__entra_auth__"
    )

    assert profile.collection_status == "unavailable"
    assert "VIEW DATABASE STATE" in profile.description


def test_missing_sql_credentials_returns_skipped_profile():
    synapse_client = client()
    synapse_client.sql_auth_mode = "sql"

    profile = synapse_client._get_dedicated_pool_workload(
        "workspace", pool(), "admin", None
    )

    assert profile.collection_status == "skipped"
    assert "authentication" in profile.description


def test_paused_pool_returns_unavailable_profile():
    synapse_client = client()

    profile = synapse_client._get_dedicated_pool_workload(
        "workspace", pool(status="Paused"), None, "__entra_auth__"
    )

    assert profile.collection_status == "unavailable"
    assert "paused" in profile.description


def test_unexpected_collection_error_is_not_swallowed():
    synapse_client = client()
    odbc = Mock()
    odbc.get_query_history.side_effect = ValueError("bad row mapping")
    synapse_client._create_odbc_client = Mock(return_value=odbc)

    try:
        synapse_client._get_dedicated_pool_workload(
            "workspace", pool(), None, "__entra_auth__"
        )
    except ValueError as exc:
        assert str(exc) == "bad row mapping"
    else:
        raise AssertionError("Unexpected programming errors must propagate")
