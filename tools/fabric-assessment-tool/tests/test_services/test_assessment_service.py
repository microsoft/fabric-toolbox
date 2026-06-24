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
