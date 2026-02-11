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
