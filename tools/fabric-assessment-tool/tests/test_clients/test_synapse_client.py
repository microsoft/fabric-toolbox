import os

from fabric_assessment_tool.clients.synapse_client import SynapseClient

workspace_name = "lakelense"

def test_get_workspace_info_success():

    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    assert workspace_info is not None


def test_get_notebooks_success():

    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    notebooks = cc._get_notebooks(workspace_name)

    assert notebooks is not None


def test_get_sql_pools_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    sql_pools = cc._get_sql_pools(workspace_name)

    assert sql_pools is not None


def test_get_spark_pools_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    spark_pools = cc._get_spark_pools(workspace_name)

    assert spark_pools is not None


def test_get_pipelines_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    pipelines = cc._get_pipelines(workspace_name)

    assert pipelines is not None


def test_get_serverless_databases_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    databases = cc._get_serverless_databases(workspace_name)

    assert databases is not None


def test_get_serverless_schemas_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    databases = cc._get_serverless_databases(workspace_name)

    schemas = cc._get_serverless_database_schemas(workspace_name, databases.databases[-1].name)

    assert schemas is not None


def test_get_serverless_database_tables_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    databases = cc._get_serverless_databases(workspace_name)

    tables = cc._get_serverless_database_tables(workspace_name, databases.databases[-1].name)

    assert tables is not None


def test_get_serverless_database_views_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    databases = cc._get_serverless_databases(workspace_name)

    views = cc._get_serverless_database_views(workspace_name, databases.databases[-1].name)

    assert views is not None


def test_get_dedicated_schemas_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    sql_pools = cc._get_sql_pools(workspace_name)

    schemas = cc._get_dedicated_schemas(workspace_name, sql_pools.dedicated_pools[0].name)

    assert schemas is not None


def test_get_dedicated_schema_tables_success():
    cc = SynapseClient()

    workspace_info = cc._get_workspace_info(workspace_name)

    cc._get_synapse_clients(workspace_info.endpoints)

    sql_pools = cc._get_sql_pools(workspace_name)

    schemas = cc._get_dedicated_schemas(workspace_name, sql_pools.dedicated_pools[0].name)

    tables = cc._get_dedicated_schema_tables(workspace_name, sql_pools.dedicated_pools[0].name, schemas.schemas[0].name)

    assert tables is not None


def test_dev_endpoint_permission_handling():
    """Test that 403 errors on dev endpoints are handled correctly"""
    import unittest.mock as mock
    from fabric_assessment_tool.errors.api import FATError
    
    cc = SynapseClient()
    
    # Mock workspace info to avoid real API calls
    mock_workspace = mock.MagicMock()
    mock_workspace.endpoints = {"dev": "test.dev.azuresynapse.net"}
    
    with mock.patch.object(cc, '_get_workspace_info', return_value=mock_workspace):
        with mock.patch.object(cc, '_get_synapse_clients'):
            # Create a mock dev client that throws 403
            mock_dev_client = mock.MagicMock()
            mock_dev_client.do_request.side_effect = FATError("Forbidden", "Forbidden")
            cc.synapse_clients = {"dev": mock_dev_client}
            
            # Test that permission issues are tracked
            pipelines = cc._get_pipelines("test_workspace")
            
            # Verify that permission issues were detected
            assert cc.dev_endpoint_permission_issues == True
            
            # Verify that empty result is returned instead of error
            assert len(pipelines.pipelines) == 0

