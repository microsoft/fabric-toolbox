"""Unit tests for Databricks catalog parallel extraction behavior."""

from unittest.mock import MagicMock, patch

from fabric_assessment_tool.clients.databricks_client import DatabricksClient


def _client_with_mock_api() -> DatabricksClient:
    client = DatabricksClient.__new__(DatabricksClient)
    client.api_client = MagicMock()
    client._max_parallel_api_calls = 6
    return client


@patch.object(DatabricksClient, "_build_catalog")
def test_get_catalogs_builds_catalogs_without_parallel_map(mock_build_catalog):
    client = _client_with_mock_api()
    client.api_client.do_request.return_value = MagicMock(
        json=lambda: {"catalogs": [{"name": "c1"}, {"name": "c2"}]}
    )
    mock_build_catalog.side_effect = lambda catalog: {"name": catalog["name"]}

    result = client._get_catalogs()

    assert len(result.catalogs) == 2
    assert mock_build_catalog.call_count == 2


@patch.object(DatabricksClient, "_build_schema_from_catalog")
@patch.object(DatabricksClient, "_parallel_map_ordered")
def test_get_schemas_uses_parallel_map(mock_parallel, mock_build_schema):
    client = _client_with_mock_api()
    client.api_client.do_request.return_value = MagicMock(
        json=lambda: {"schemas": [{"name": "s1"}, {"name": "s2"}]}
    )
    mock_build_schema.side_effect = lambda catalog_name, schema: {
        "catalog": catalog_name,
        "schema": schema["name"],
    }
    mock_parallel.side_effect = lambda items, worker, max_workers: [
        worker(item) for item in items
    ]

    result = client._get_schemas("c1")

    assert len(result.schemas) == 2
    mock_parallel.assert_called_once()
    called_items, _, called_workers = mock_parallel.call_args[0]
    assert len(called_items) == 2
    assert called_workers == 3


def test_catalog_parallel_api_calls_capped():
    client = _client_with_mock_api()
    client._max_parallel_api_calls = 10
    assert client._catalog_parallel_api_calls() == 3
    client._max_parallel_api_calls = 2
    assert client._catalog_parallel_api_calls() == 2
