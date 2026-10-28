"""Unit tests for Databricks API call reduction behaviors."""

import logging
from unittest.mock import MagicMock

import pytest

from fabric_assessment_tool.assessment.databricks import (
    DatabricksClusters,
    DatabricksWorkspaceInfo,
)
from fabric_assessment_tool.clients.databricks_client import DatabricksClient


def _client_with_mock_api() -> DatabricksClient:
    client = DatabricksClient.__new__(DatabricksClient)
    client.api_client = MagicMock()
    client.extraction_warnings = []
    client._max_parallel_api_calls = 4
    client._schema_resource_cache = {}
    return client


def _json_response(payload: dict) -> MagicMock:
    response = MagicMock()
    response.json.return_value = payload
    return response


def test_build_notebook_uses_list_metadata_without_status_or_export_calls():
    client = _client_with_mock_api()

    notebook = client._build_notebook_from_obj(
        obj={"path": "/Users/me/nb", "language": "PYTHON", "size": 12},
        status_endpoint="api/2.0/workspace/get-status",
        export_endpoint="api/2.0/workspace/export",
        download_content=False,
    )

    assert notebook.default_language == "PYTHON"
    assert notebook.size == 12
    assert notebook.content is None
    assert notebook.embedded_languages == []
    assert notebook.other_magics == []
    assert client.api_client.do_request.call_count == 0


def test_get_notebooks_logs_skipped_status_and_export_calls(caplog):
    client = _client_with_mock_api()
    client._extract_notebook_paths = MagicMock(
        return_value=[
            {"path": "/Users/me/has-metadata", "language": "PYTHON", "size": 10},
            {"path": "/Users/me/missing-language", "size": 11},
        ]
    )

    def _do_request(args):
        assert args.uri == "api/2.0/workspace/get-status"
        assert args.request_params == {"path": "/Users/me/missing-language"}
        return _json_response({"language": "SQL", "size": 11})

    client.api_client.do_request.side_effect = _do_request

    with caplog.at_level(logging.INFO):
        notebooks = client._get_notebooks(download_content=False)

    assert [nb.default_language for nb in notebooks.notebooks] == ["PYTHON", "SQL"]
    assert all(nb.content is None for nb in notebooks.notebooks)
    assert client.api_client.do_request.call_count == 1
    assert "skipped 1 workspace/get-status calls" in caplog.text
    assert "skipped 2 workspace/export calls" in caplog.text
    counters = client._get_api_call_savings_metrics()
    assert counters["notebook_status_skipped"] == 1
    assert counters["notebook_export_skipped"] == 2


def test_get_job_details_skips_runs_list_for_non_notebook_jobs():
    client = _client_with_mock_api()

    job = {
        "job_id": 11,
        "settings": {
            "name": "jar-job",
            "format": "MULTI_TASK",
            "tasks": [
                {
                    "task_key": "task1",
                    "spark_jar_task": {"main_class_name": "com.example.Main"},
                }
            ],
        },
        "created_time": 1700000000000,
    }

    result = client._get_job_details(job)

    assert client.api_client.do_request.call_count == 0
    assert result.latest_runs.runs == []
    assert result.avg_duration_ms_last_3_runs is None


def test_get_job_details_fetches_runs_for_notebook_jobs():
    client = _client_with_mock_api()
    client.api_client.do_request.return_value = _json_response(
        {
            "runs": [
                {
                    "run_id": 123,
                    "state": {
                        "life_cycle_state": "TERMINATED",
                        "result_state": "SUCCESS",
                    },
                    "start_time": 1700000000000,
                    "end_time": 1700000001000,
                    "run_duration": 1000,
                    "execution_duration": 1000,
                }
            ]
        }
    )

    job = {
        "job_id": 22,
        "settings": {
            "name": "nb-job",
            "format": "MULTI_TASK",
            "tasks": [
                {
                    "task_key": "task1",
                    "notebook_task": {"notebook_path": "/Users/me/nb"},
                }
            ],
        },
        "created_time": 1700000000000,
    }

    result = client._get_job_details(job)

    assert client.api_client.do_request.call_count == 1
    called_args = client.api_client.do_request.call_args[0][0]
    assert "runs/list" in called_args.uri
    assert len(result.latest_runs.runs) == 1
    assert result.avg_duration_ms_last_3_runs == 1000


@pytest.mark.parametrize(
    "method_name,response_key,response_item",
    [
        (
            "_get_tables",
            "tables",
            {
                "name": "t1",
                "catalog_name": "c1",
                "schema_name": "s1",
                "table_type": "MANAGED",
                "columns": [],
                "properties": {},
            },
        ),
        (
            "_get_volumes",
            "volumes",
            {
                "name": "v1",
                "catalog_name": "c1",
                "schema_name": "s1",
                "storage_location": "abfss://x",
                "type": "MANAGED",
            },
        ),
        (
            "_get_functions",
            "functions",
            {
                "name": "f1",
                "catalog_name": "c1",
                "schema_name": "s1",
                "external_language": "SQL",
            },
        ),
    ],
)
def test_schema_resource_requests_are_cached_per_catalog_schema(
    method_name, response_key, response_item
):
    client = _client_with_mock_api()

    def _do_request(args):
        if "schema_name=s1" in args.uri:
            return _json_response({response_key: [response_item]})
        return _json_response({response_key: []})

    client.api_client.do_request.side_effect = _do_request
    method = getattr(client, method_name)

    first = method("c1", "s1")
    second = method("c1", "s1")
    third = method("c1", "s2")

    assert second is first
    assert third == []
    assert client.api_client.do_request.call_count == 2
    counter_key = {
        "_get_tables": "schema_cache_tables",
        "_get_volumes": "schema_cache_volumes",
        "_get_functions": "schema_cache_functions",
    }[method_name]
    counters = client._get_api_call_savings_metrics()
    assert counters["schema_cache_total"] == 1
    assert counters[counter_key] == 1


def test_get_schemas_dedupes_duplicate_schema_names():
    client = _client_with_mock_api()
    client.api_client.do_request.return_value = _json_response(
        {"schemas": [{"name": "s1"}, {"name": "s1"}, {"name": "s2"}]}
    )
    client._build_schema_from_catalog = MagicMock(
        side_effect=lambda catalog_name, schema: {
            "catalog": catalog_name,
            "schema": schema["name"],
        }
    )
    client._parallel_map_ordered = MagicMock(
        side_effect=lambda items, worker, max_workers: [worker(item) for item in items]
    )

    result = client._get_schemas("c1")

    assert [schema["schema"] for schema in result.schemas] == ["s1", "s2"]
    assert client._build_schema_from_catalog.call_count == 2
    called_items = client._parallel_map_ordered.call_args[0][0]
    assert len(called_items) == 2


def test_assess_workspace_resets_schema_resource_cache_at_start(caplog):
    client = _client_with_mock_api()
    client._schema_resource_cache = {("tables", "c1", "s1"): ["cached"]}

    client._get_workspace_info = MagicMock(
        return_value=DatabricksWorkspaceInfo(
            id="1",
            name="ws",
            resource_group="rg",
            url="https://dbc-example.cloud.databricks.com",
            status="RUNNING",
            tier="PREMIUM",
            json_response={},
        )
    )
    client._auth_databricks = MagicMock()
    client._get_clusters = MagicMock(return_value=DatabricksClusters(clusters=[]))

    with caplog.at_level(logging.INFO):
        assessment = client.assess_workspace(
            workspace_name="ws",
            mode="full",
            resources=["clusters"],
        )

    assert client._schema_resource_cache == {}
    assert assessment.clusters.clusters == []
    assert "Estimated Databricks API calls saved: total=0" in caplog.text
