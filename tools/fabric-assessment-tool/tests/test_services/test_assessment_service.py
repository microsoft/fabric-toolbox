"""Tests for AssessmentService."""

import os
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from fabric_assessment_tool.services.assessment_service import AssessmentService


def test_aws_databricks_without_workspace_requires_account_api_auth(tmp_path):
    service = AssessmentService()

    with pytest.raises(ValueError, match="DATABRICKS_ACCOUNT_ID"):
        service.assess(
            source="databricks",
            mode="full",
            workspaces=[],
            output_path=str(tmp_path),
            cloud="aws",
        )


@patch.dict(
    os.environ,
    {
        "DATABRICKS_ACCOUNT_ID": "account-123",
        "DATABRICKS_CLIENT_ID": "client-id",
        "DATABRICKS_CLIENT_SECRET": "client-secret",
    },
    clear=True,
)
@patch("fabric_assessment_tool.services.assessment_service.utils_ui.prompt_confirm")
@patch(
    "fabric_assessment_tool.services.assessment_service.utils_ui.prompt_select_items"
)
def test_aws_databricks_without_workspace_lists_account_workspaces(
    mock_prompt_select_items, mock_prompt_confirm, tmp_path
):
    service = AssessmentService()
    fake_client = MagicMock()
    fake_client.get_workspaces.return_value = [
        SimpleNamespace(name="workspace-a"),
        SimpleNamespace(name="workspace-b"),
    ]
    mock_prompt_select_items.return_value = []
    mock_prompt_confirm.return_value = False

    with patch.object(service, "_get_client", return_value=fake_client):
        result = service.assess(
            source="databricks",
            mode="full",
            workspaces=[],
            output_path=str(tmp_path),
            cloud="aws",
        )

    assert result == {}
    fake_client.get_workspaces.assert_called_once_with()
    mock_prompt_select_items.assert_called_once_with(
        "Select workspaces:", ["workspace-a", "workspace-b"]
    )


@patch.dict(
    os.environ,
    {
        "DATABRICKS_HOST": "https://dbc-example.cloud.databricks.com",
        "DATABRICKS_TOKEN": "test-token",
    },
    clear=True,
)
def test_aws_databricks_multiple_workspaces_requires_oauth(tmp_path):
    service = AssessmentService()

    with pytest.raises(ValueError, match="DATABRICKS_CLIENT_ID"):
        service.assess(
            source="databricks",
            mode="full",
            workspaces=["workspace-a", "workspace-b"],
            output_path=str(tmp_path),
            cloud="aws",
        )
"""Tests for AssessmentService serverless option propagation."""

from fabric_assessment_tool.assessment.common import AssessmentStatus
from fabric_assessment_tool.assessment.synapse import (
    SynapseAssessment,
    SynapseAssessmentMetadata,
    SynapseDataflows,
    SynapseDatasets,
    SynapseIntegrationRuntimes,
    SynapseLibraries,
    SynapseLinkedServices,
    SynapseManagedPrivateEndpoints,
    SynapseNotebooks,
    SynapsePipelines,
    SynapseServerlessActivity,
    SynapseServerlessActivityCollectionMetadata,
    SynapseServerlessDatabases,
    SynapseServerlessPool,
    SynapseSparkConfigurations,
    SynapseSparkJobDefinitions,
    SynapseSparkPools,
    SynapseSqlPools,
    SynapseSqlScripts,
    SynapseWorkspaceInfo,
)
from fabric_assessment_tool.services.assessment_service import AssessmentService


def _build_assessment() -> SynapseAssessment:
    return SynapseAssessment(
        status=AssessmentStatus(status="completed"),
        workspace_info=SynapseWorkspaceInfo(
            id="/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Synapse/workspaces/ws",
            name="ws",
            resource_group="rg",
            location="eastus",
            status="Online",
            endpoints={"dev": "https://ws.dev.azuresynapse.net"},
            json_response={"properties": {"sqlAdministratorLogin": "sqladmin"}},
        ),
        sql_pools=SynapseSqlPools(
            dedicated_pools=[],
            serverless_pool=SynapseServerlessPool(
                name="Built-in",
                status="Online",
                queries_last_24h=None,
                databases=SynapseServerlessDatabases(databases=[]),
                json_response=None,
                activity=SynapseServerlessActivity(
                    metadata=SynapseServerlessActivityCollectionMetadata(
                        status="skipped",
                        attempted=False,
                        history_days=30,
                        top_n=1000,
                    )
                ),
            ),
        ),
        spark_pools=SynapseSparkPools(spark_pools=[]),
        pipelines=SynapsePipelines(pipelines=[]),
        dataflows=SynapseDataflows(dataflows=[]),
        notebooks=SynapseNotebooks(notebooks=[]),
        spark_job_definitions=SynapseSparkJobDefinitions(spark_job_definitions=[]),
        sql_scripts=SynapseSqlScripts(sql_scripts=[]),
        integration_runtimes=SynapseIntegrationRuntimes(integration_runtimes=[]),
        linked_services=SynapseLinkedServices(linked_services=[]),
        datasets=SynapseDatasets(datasets=[]),
        managed_private_endpoints=SynapseManagedPrivateEndpoints(
            managed_private_endpoints=[]
        ),
        libraries=SynapseLibraries(libraries=[]),
        spark_configurations=SynapseSparkConfigurations(spark_configurations=[]),
        assessment_metadata=SynapseAssessmentMetadata(
            mode="full", timestamp="2024-01-15T10:00:00"
        ),
        subscription_id="sub",
        resource_group="rg",
    )


def test_assessment_service_passes_serverless_options_to_client(monkeypatch, tmp_path):
    """AssessmentService should forward serverless settings when building the client."""
    service = AssessmentService()
    captured_kwargs = {}

    class FakeClient:
        def assess_workspace(self, workspace_name, mode):
            assert workspace_name == "ws"
            assert mode == "full"
            return _build_assessment()

    def fake_get_client(source, **kwargs):
        captured_kwargs.update(kwargs)
        assert source == "synapse"
        return FakeClient()

    monkeypatch.setattr(service, "_get_client", fake_get_client)
    monkeypatch.setattr(
        service.export_service,
        "export_assessment",
        lambda **kwargs: {
            "workspace_directory": str(tmp_path / "ws"),
            "files_created": [],
            "total_files": 0,
        },
    )

    result = service.assess(
        source="synapse",
        mode="full",
        workspaces=["ws"],
        output_path=str(tmp_path),
        serverless_history_days=15,
        serverless_top_n=250,
        skip_serverless_activity=True,
        serverless_sql_auth_mode="entra-default",
        serverless_sql_username="override_user",
        serverless_sql_password="override_password",
        serverless_sql_client_id="override_client_id",
        serverless_sql_client_secret="override_client_secret",
        serverless_sql_tenant_id="override_tenant_id",
    )

    assert captured_kwargs["serverless_history_days"] == 15
    assert captured_kwargs["serverless_top_n"] == 250
    assert captured_kwargs["skip_serverless_activity"] is True
    assert captured_kwargs["serverless_sql_auth_mode"] == "entra-default"
    assert captured_kwargs["serverless_sql_username"] == "override_user"
    assert captured_kwargs["serverless_sql_password"] == "override_password"
    assert captured_kwargs["serverless_sql_client_id"] == "override_client_id"
    assert captured_kwargs["serverless_sql_client_secret"] == "override_client_secret"
    assert captured_kwargs["serverless_sql_tenant_id"] == "override_tenant_id"
    assert result["summary"]["assessed_workspaces"] == 1
