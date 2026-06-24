import os
from types import SimpleNamespace
from unittest.mock import patch

from fabric_assessment_tool.clients.databricks_client import DatabricksClient

workspace_name = "mcole-adb"


def test_get_workspace_info_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    assert workspace_info is not None
    assert workspace_info.json_response is not None


def test_get_clusters_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    clusters = cc._get_clusters()

    assert len(clusters.clusters) > 0


def test_get_notebooks_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    notebooks = cc._get_notebooks()

    assert len(notebooks.notebooks) > 0


def test_get_jobs_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    jobs = cc._get_jobs()

    assert len(jobs.jobs) > 0


def test_get_sql_warehouses_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    sql_warehouses = cc._get_sql_warehouses()

    assert len(sql_warehouses.sql_warehouses) > 0


def test_get_pipelines_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    pipelines = cc._get_pipelines()

    assert pipelines is not None
    assert isinstance(pipelines.pipelines, list)


def test_get_repos_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    repos = cc._get_repos()

    assert repos is not None
    assert isinstance(repos.repos, list)


def test_get_experiments_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    experiments = cc._get_experiments()

    assert experiments is not None
    assert isinstance(experiments.experiments, list)


def test_get_serving_endpoints_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    serving_endpoints = cc._get_serving_endpoints()

    assert serving_endpoints is not None
    assert isinstance(serving_endpoints.serving_endpoints, list)


def test_get_alerts_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    alerts = cc._get_alerts()

    assert alerts is not None
    assert isinstance(alerts.alerts, list)


def test_get_genie_spaces_success():

    cc = DatabricksClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._auth_databricks(workspace_info.url)

    genie_spaces = cc._get_genie_spaces()

    assert genie_spaces is not None
    assert isinstance(genie_spaces.genie_spaces, list)


@patch.dict(
    os.environ,
    {
        "DATABRICKS_HOST": "https://dbc-example.cloud.databricks.com",
        "DATABRICKS_TOKEN": "test-token",
        "DATABRICKS_WORKSPACE_NAME": "aws-workspace",
        "DATABRICKS_WORKSPACE_REGION": "us-east-1",
    },
)
def test_aws_workspace_info_uses_environment_variables():
    cc = DatabricksClient(cloud="aws")

    workspace_info = cc._get_workspace_info("aws-workspace")

    assert workspace_info.name == "aws-workspace"
    assert workspace_info.url == "https://dbc-example.cloud.databricks.com"
    assert workspace_info.location == "us-east-1"
    assert workspace_info.workspace_type == "aws"
    assert workspace_info.json_response["source"] == "environment"


@patch.dict(
    os.environ,
    {
        "DATABRICKS_HOST": "https://dbc-example.cloud.databricks.com",
        "DATABRICKS_TOKEN": "test-token",
    },
    clear=True,
)
def test_aws_get_workspaces_requires_account_api_authentication():
    cc = DatabricksClient(cloud="aws")

    try:
        cc.get_workspaces()
    except ValueError as exc:
        assert "DATABRICKS_ACCOUNT_ID" in str(exc)
    else:
        raise AssertionError("Expected AWS workspace listing validation to fail")


class FakeAccountWorkspace(SimpleNamespace):
    def as_dict(self):
        return vars(self)


@patch.dict(os.environ, {"DATABRICKS_TOKEN": "test-token"}, clear=True)
def test_aws_workspace_token_requires_databricks_host():
    try:
        DatabricksClient(cloud="aws")
    except ValueError as exc:
        assert "DATABRICKS_HOST" in str(exc)
    else:
        raise AssertionError("Expected AWS Databricks auth validation to fail")


@patch.dict(
    os.environ,
    {"DATABRICKS_HOST": "https://dbc-example.cloud.databricks.com"},
    clear=True,
)
def test_aws_workspace_requires_environment_authentication():
    try:
        DatabricksClient(cloud="aws")
    except ValueError as exc:
        assert "DATABRICKS_TOKEN" in str(exc)
    else:
        raise AssertionError("Expected AWS Databricks auth validation to fail")


@patch("fabric_assessment_tool.clients.databricks_client.AccountClient")
@patch.dict(
    os.environ,
    {
        "DATABRICKS_ACCOUNT_ID": "account-123",
        "DATABRICKS_CLIENT_ID": "client-id",
        "DATABRICKS_CLIENT_SECRET": "client-secret",
    },
    clear=True,
)
def test_aws_workspace_info_resolves_multiple_account_workspaces(mock_account_client):
    mock_account_client.return_value.workspaces.list.return_value = [
        FakeAccountWorkspace(
            workspace_id=1,
            workspace_name="workspace-a",
            deployment_name="dbc-a",
            aws_region="us-east-1",
            workspace_status="RUNNING",
            pricing_tier="PREMIUM",
        ),
        FakeAccountWorkspace(
            workspace_id=2,
            workspace_name="workspace-b",
            deployment_name="dbc-b",
            aws_region="us-west-2",
            workspace_status="RUNNING",
            pricing_tier="PREMIUM",
        ),
    ]

    cc = DatabricksClient(cloud="aws")
    workspace_a = cc._get_workspace_info("workspace-a")
    workspace_b = cc._get_workspace_info("workspace-b")

    assert workspace_a.url == "https://dbc-a.cloud.databricks.com"
    assert workspace_b.url == "https://dbc-b.cloud.databricks.com"
    assert workspace_a.location == "us-east-1"
    assert workspace_b.location == "us-west-2"
    mock_account_client.assert_called_once_with(
        host="https://accounts.cloud.databricks.com",
        account_id="account-123",
        client_id="client-id",
        client_secret="client-secret",
    )


@patch.dict(
    os.environ,
    {
        "DATABRICKS_CLIENT_ID": "client-id",
        "DATABRICKS_CLIENT_SECRET": "client-secret",
    },
    clear=True,
)
def test_aws_workspace_info_accepts_workspace_hosts_with_oauth():
    cc = DatabricksClient(cloud="aws")

    workspace_a = cc._get_workspace_info("https://dbc-a.cloud.databricks.com")
    workspace_b = cc._get_workspace_info("dbc-b.cloud.databricks.com")

    assert workspace_a.name == "dbc-a"
    assert workspace_a.url == "https://dbc-a.cloud.databricks.com"
    assert workspace_b.name == "dbc-b"
    assert workspace_b.url == "https://dbc-b.cloud.databricks.com"


@patch("fabric_assessment_tool.clients.databricks_client.WorkspaceClient")
@patch("fabric_assessment_tool.clients.databricks_client.AccountClient")
@patch.dict(
    os.environ,
    {
        "DATABRICKS_ACCOUNT_ID": "account-123",
        "DATABRICKS_CLIENT_ID": "client-id",
        "DATABRICKS_CLIENT_SECRET": "client-secret",
        "DATABRICKS_TOKEN": "workspace-token",
    },
    clear=True,
)
def test_aws_workspace_auth_prefers_oauth_for_account_workspaces(
    mock_account_client, mock_workspace_client
):
    mock_account_client.return_value.workspaces.list.return_value = [
        FakeAccountWorkspace(
            workspace_id=1,
            workspace_name="workspace-a",
            deployment_name="dbc-a",
            aws_region="us-east-1",
        )
    ]

    cc = DatabricksClient(cloud="aws")
    workspace_info = cc._get_workspace_info("workspace-a")
    cc._auth_databricks(workspace_info.url)

    mock_workspace_client.assert_called_once_with(
        host="https://dbc-a.cloud.databricks.com",
        client_id="client-id",
        client_secret="client-secret",
    )
