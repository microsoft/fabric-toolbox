import os

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
