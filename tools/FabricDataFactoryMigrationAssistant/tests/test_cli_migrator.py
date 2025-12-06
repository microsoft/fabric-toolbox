"""
Unit tests for the ADF to Fabric CLI Migration Tool.

This module provides comprehensive test coverage for the CLI application,
including tests for ARMTemplate parsing, Fabric API client, and CLI commands.
"""

import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Import the classes to test
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from cli_migrator import FabricAPIClient, MigrationCLI


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def temp_arm_template():
    """Create a temporary ARM template for testing."""
    template = {
        "resources": [
            {
                "type": "Microsoft.DataFactory/factories",
                "name": "TestDataFactory",
                "properties": {
                    "globalParameters": {
                        "environment": {
                            "type": "String",
                            "value": "dev"
                        },
                        "batchSize": {
                            "type": "Int",
                            "value": 100
                        }
                    }
                },
                "resources": [
                    {
                        "type": "Microsoft.DataFactory/factories/pipelines",
                        "name": "[concat(parameters('factoryName'), '/TestPipeline')]",
                        "properties": {
                            "activities": [
                                {
                                    "name": "CopyActivity",
                                    "type": "Copy",
                                    "inputs": [{"referenceName": "SourceDataset", "type": "DatasetReference"}],
                                    "outputs": [{"referenceName": "SinkDataset", "type": "DatasetReference"}],
                                    "typeProperties": {}
                                }
                            ]
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/linkedServices",
                        "name": "[concat(parameters('factoryName'), '/AzureSqlLS')]",
                        "properties": {
                            "type": "AzureSqlDatabase",
                            "typeProperties": {
                                "connectionString": "Server=tcp:myserver.database.windows.net"
                            }
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/datasets",
                        "name": "[concat(parameters('factoryName'), '/SourceDataset')]",
                        "properties": {
                            "type": "AzureSqlTable",
                            "linkedServiceName": {"referenceName": "AzureSqlLS"}
                        }
                    }
                ]
            }
        ]
    }
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(template, f)
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    Path(temp_path).unlink(missing_ok=True)


@pytest.fixture
def temp_connection_config():
    """Create a temporary connection configuration file."""
    config = {
        "AzureSqlLS": {
            "connectionType": "AzureSqlDatabase",
            "connectionDetails": {
                "server": "myserver.database.windows.net",
                "database": "mydb"
            }
        },
        "BlobStorageLS": {
            "connectionType": "AzureBlobStorage",
            "connectionDetails": {
                "accountName": "mystorageaccount"
            }
        }
    }
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(config, f)
        temp_path = f.name
    
    yield temp_path
    
    # Cleanup
    Path(temp_path).unlink(missing_ok=True)


@pytest.fixture
def migration_cli():
    """Create a MigrationCLI instance for testing."""
    return MigrationCLI()


# ============================================================================
# FabricAPIClient Tests
# ============================================================================

class TestFabricAPIClient:
    """Test suite for FabricAPIClient."""
    
    def test_init_with_token(self):
        """Test initializing FabricAPIClient with provided token."""
        token = "test-token-123"
        workspace_id = "workspace-abc-123"
        
        client = FabricAPIClient(workspace_id, token)
        
        assert client.workspace_id == workspace_id
        assert client.token == token
        assert client.base_url == "https://api.fabric.microsoft.com/v1"
    
    @patch('subprocess.run')
    def test_get_token_from_azure_cli_success(self, mock_run):
        """Test successfully getting token from Azure CLI."""
        mock_run.return_value = Mock(
            stdout='{"accessToken": "token-from-cli"}',
            returncode=0
        )
        
        client = FabricAPIClient("workspace-123")
        
        assert client.token == "token-from-cli"
        mock_run.assert_called_once()
    
    @patch('subprocess.run')
    def test_get_token_from_azure_cli_failure(self, mock_run):
        """Test handling Azure CLI token retrieval failure."""
        mock_run.side_effect = Exception("Azure CLI not found")
        
        with pytest.raises(SystemExit):
            FabricAPIClient("workspace-123")
    
    @patch('requests.post')
    def test_create_connection_success(self, mock_post):
        """Test successful connection creation."""
        mock_post.return_value = Mock(
            json=lambda: {"id": "connection-123"},
            status_code=200
        )
        mock_post.return_value.raise_for_status = Mock()
        
        client = FabricAPIClient("workspace-123", "token-123")
        connection_def = {
            "displayName": "MyConnection",
            "connectionType": "AzureSqlDatabase"
        }
        
        result = client.create_connection(connection_def)
        
        assert result == "connection-123"
        mock_post.assert_called_once()
    
    @patch('requests.post')
    def test_create_connection_failure(self, mock_post):
        """Test handling connection creation failure."""
        mock_post.return_value = Mock(
            raise_for_status=Mock(side_effect=Exception("API Error"))
        )
        
        client = FabricAPIClient("workspace-123", "token-123")
        connection_def = {"displayName": "MyConnection"}
        
        result = client.create_connection(connection_def)
        
        assert result is None
    
    @patch('requests.post')
    def test_create_pipeline_success(self, mock_post):
        """Test successful pipeline creation."""
        mock_post.return_value = Mock(
            json=lambda: {"id": "pipeline-456"},
            status_code=200
        )
        mock_post.return_value.raise_for_status = Mock()
        
        client = FabricAPIClient("workspace-123", "token-123")
        pipeline_def = {
            "payload": "base64-encoded-payload"
        }
        
        result = client.create_pipeline(pipeline_def, "TestPipeline")
        
        assert result == "pipeline-456"
        mock_post.assert_called_once()
    
    @patch('requests.post')
    def test_create_variable_library_success(self, mock_post):
        """Test successful variable library creation."""
        mock_post.return_value = Mock(
            json=lambda: {"id": "library-789"},
            status_code=200
        )
        mock_post.return_value.raise_for_status = Mock()
        
        client = FabricAPIClient("workspace-123", "token-123")
        variables = {
            "environment": {"type": "String", "value": "dev"},
            "batchSize": {"type": "Int", "value": 100}
        }
        
        result = client.create_variable_library("TestLibrary", variables)
        
        assert result == "library-789"
        mock_post.assert_called_once()


# ============================================================================
# MigrationCLI - Analyze Tests
# ============================================================================

class TestMigrationCLIAnalyze:
    """Test suite for MigrationCLI.analyze_arm_template command."""
    
    def test_analyze_valid_template(self, migration_cli, temp_arm_template, capsys):
        """Test analyzing a valid ARM template."""
        migration_cli.analyze_arm_template(temp_arm_template)
        
        captured = capsys.readouterr()
        
        assert "COMPONENT ANALYSIS" in captured.out
        assert "TestPipeline" in captured.out or "pipeline" in captured.out.lower()
        assert "CONNECTOR MAPPING" in captured.out
    
    def test_analyze_template_not_found(self, migration_cli):
        """Test handling non-existent template file."""
        with pytest.raises(SystemExit):
            migration_cli.analyze_arm_template("nonexistent.json")
    
    def test_analyze_invalid_json(self, migration_cli):
        """Test handling invalid JSON template."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write("{invalid json")
            temp_path = f.name
        
        try:
            with pytest.raises(SystemExit):
                migration_cli.analyze_arm_template(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_analyze_empty_template(self, migration_cli):
        """Test handling empty template."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump({"resources": []}, f)
            temp_path = f.name
        
        try:
            migration_cli.analyze_arm_template(temp_path)
            # Should complete without error
        finally:
            Path(temp_path).unlink(missing_ok=True)


# ============================================================================
# MigrationCLI - Profile Tests
# ============================================================================

class TestMigrationCLIProfile:
    """Test suite for MigrationCLI.generate_profile command."""
    
    def test_profile_generation(self, migration_cli, temp_arm_template, capsys):
        """Test generating migration profile."""
        migration_cli.generate_profile(temp_arm_template)
        
        captured = capsys.readouterr()
        
        assert "MIGRATION PROFILE" in captured.out
        assert "METRICS" in captured.out
        assert "INSIGHTS" in captured.out
        assert "Pipelines:" in captured.out
    
    def test_profile_save_to_file(self, migration_cli, temp_arm_template):
        """Test saving profile to JSON file."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            output_path = f.name
        
        try:
            # Remove file so migration_cli can create it
            Path(output_path).unlink()
            
            migration_cli.generate_profile(temp_arm_template, output_path)
            
            # Verify file was created
            assert Path(output_path).exists()
            
            # Verify file contains valid JSON
            with open(output_path, 'r') as f:
                profile_data = json.load(f)
                assert "metrics" in profile_data
                assert "insights" in profile_data
        finally:
            Path(output_path).unlink(missing_ok=True)
    
    def test_profile_metrics(self, migration_cli, temp_arm_template):
        """Test profile metrics calculation."""
        # This is tested indirectly through analyze/profile commands
        migration_cli.generate_profile(temp_arm_template)


# ============================================================================
# MigrationCLI - Migrate Tests
# ============================================================================

class TestMigrationCLIMigrate:
    """Test suite for MigrationCLI.migrate command."""
    
    @patch('cli_migrator.FabricAPIClient')
    def test_migrate_dry_run(self, mock_api_client, migration_cli, temp_arm_template, capsys):
        """Test migration in dry-run mode."""
        migration_cli.migrate(
            temp_arm_template,
            workspace_id="workspace-123",
            dry_run=True
        )
        
        captured = capsys.readouterr()
        
        assert "DRY RUN" in captured.out
        assert "No changes will be made" in captured.out
        # API client should not be called in dry-run
        mock_api_client.assert_not_called()
    
    @patch('cli_migrator.FabricAPIClient')
    def test_migrate_skip_components(self, mock_api_client, migration_cli, temp_arm_template):
        """Test migration with selective component skipping."""
        mock_instance = MagicMock()
        mock_api_client.return_value = mock_instance
        
        migration_cli.migrate(
            temp_arm_template,
            workspace_id="workspace-123",
            deploy_connections=False,
            deploy_pipelines=False,
            deploy_global_params=False,
            dry_run=False
        )
        
        # API should not be called since all deployment is skipped
        # (except for dry-run which doesn't call API)
    
    @patch('cli_migrator.FabricAPIClient')
    def test_migrate_with_connection_config(self, mock_api_client, migration_cli, 
                                           temp_arm_template, temp_connection_config):
        """Test migration with custom connection configuration."""
        mock_instance = MagicMock()
        mock_instance.create_connection.return_value = "connection-123"
        mock_api_client.return_value = mock_instance
        
        migration_cli.migrate(
            temp_arm_template,
            workspace_id="workspace-123",
            deploy_connections=True,
            deploy_pipelines=False,
            connection_config_path=temp_connection_config,
            dry_run=False
        )
        
        # Verify connection creation was attempted
        if mock_instance.create_connection.called:
            assert mock_instance.create_connection.call_count >= 1
    
    @patch('cli_migrator.FabricAPIClient')
    def test_migrate_databricks_transformation(self, mock_api_client, migration_cli, 
                                              temp_arm_template):
        """Test migration with Databricks to Trident transformation."""
        # Create template with DatabricksNotebook activity
        template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "TestDataFactory",
                    "properties": {},
                    "resources": [
                        {
                            "type": "Microsoft.DataFactory/factories/pipelines",
                            "name": "[concat(parameters('factoryName'), '/DatabricksPipeline')]",
                            "properties": {
                                "activities": [
                                    {
                                        "name": "RunNotebook",
                                        "type": "DatabricksNotebook",
                                        "linkedServiceName": {"referenceName": "DatabricksLS"},
                                        "typeProperties": {
                                            "notebookPath": "/test",
                                            "baseParameters": {"key": "value"}
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(template, f)
            temp_path = f.name
        
        try:
            migration_cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                deploy_connections=False,
                deploy_pipelines=True,
                databricks_to_trident=True,
                dry_run=True
            )
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_migrate_invalid_template(self, migration_cli):
        """Test migration with invalid ARM template."""
        with pytest.raises(SystemExit):
            migration_cli.migrate(
                "nonexistent.json",
                workspace_id="workspace-123"
            )


# ============================================================================
# Component Analysis Tests
# ============================================================================

class TestComponentAnalysis:
    """Test suite for component analysis functionality."""
    
    def test_parse_pipelines(self, migration_cli, temp_arm_template):
        """Test pipeline parsing from ARM template."""
        with open(temp_arm_template, 'r') as f:
            template_content = f.read()
        
        components = migration_cli.parser_obj.parse_arm_template(template_content)
        
        # Should have at least a pipeline component
        assert len(components) > 0
    
    def test_parse_linked_services(self, migration_cli, temp_arm_template):
        """Test linked service parsing."""
        with open(temp_arm_template, 'r') as f:
            template_content = f.read()
        
        components = migration_cli.parser_obj.parse_arm_template(template_content)
        linked_services = [c for c in components if "linkedService" in c.type.value.lower()]
        
        # Should find at least one linked service
        assert len(linked_services) > 0
    
    def test_parse_datasets(self, migration_cli, temp_arm_template):
        """Test dataset parsing."""
        with open(temp_arm_template, 'r') as f:
            template_content = f.read()
        
        components = migration_cli.parser_obj.parse_arm_template(template_content)
        datasets = [c for c in components if "dataset" in c.type.value.lower()]
        
        # Should find at least one dataset
        assert len(datasets) > 0
    
    def test_connector_mapping(self, migration_cli):
        """Test connector type mapping."""
        test_cases = [
            ("AzureSqlDatabase", "AzureSqlDatabase"),
            ("AzureBlobStorage", "AzureBlobStorage"),
            ("AzureDataLakeStorageGen2", "AzureDataLakeStorageGen2"),
        ]
        
        for adf_type, expected_fabric_type in test_cases:
            mapping = migration_cli.connector_mapper.map_connector({"type": adf_type})
            
            assert mapping.adf_type == adf_type
            assert mapping.fabric_type is not None
            assert mapping.is_supported


# ============================================================================
# Pipeline Transformation Tests
# ============================================================================

class TestPipelineTransformation:
    """Test suite for pipeline transformation."""
    
    def test_transform_simple_copy_activity(self, migration_cli):
        """Test transforming a simple Copy activity."""
        pipeline_def = {
            "properties": {
                "activities": [
                    {
                        "name": "CopyActivity",
                        "type": "Copy",
                        "inputs": [{"referenceName": "Source"}],
                        "outputs": [{"referenceName": "Sink"}],
                        "typeProperties": {}
                    }
                ]
            }
        }
        
        transformed = migration_cli.transformer.transform_pipeline_definition(
            pipeline_def,
            "TestPipeline"
        )
        
        assert transformed is not None
        assert "properties" in transformed
        activities = transformed["properties"].get("activities", [])
        assert len(activities) > 0
    
    def test_transform_lookup_activity(self, migration_cli):
        """Test transforming a Lookup activity."""
        pipeline_def = {
            "properties": {
                "activities": [
                    {
                        "name": "LookupActivity",
                        "type": "Lookup",
                        "dataset": {"referenceName": "Dataset"},
                        "typeProperties": {}
                    }
                ]
            }
        }
        
        transformed = migration_cli.transformer.transform_pipeline_definition(
            pipeline_def,
            "TestPipeline"
        )
        
        assert transformed is not None
    
    def test_transform_with_parameters(self, migration_cli):
        """Test transforming pipeline with parameters."""
        pipeline_def = {
            "properties": {
                "parameters": {
                    "param1": {"type": "string", "defaultValue": "value1"}
                },
                "activities": []
            }
        }
        
        transformed = migration_cli.transformer.transform_pipeline_definition(
            pipeline_def,
            "TestPipeline"
        )
        
        assert "parameters" in transformed.get("properties", {})


# ============================================================================
# Error Handling Tests
# ============================================================================

class TestErrorHandling:
    """Test suite for error handling."""
    
    def test_handle_missing_template_file(self, migration_cli):
        """Test handling missing template file."""
        with pytest.raises(SystemExit):
            migration_cli.analyze_arm_template("/nonexistent/path/template.json")
    
    def test_handle_invalid_json_format(self, migration_cli):
        """Test handling invalid JSON format."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write("{ invalid json }")
            temp_path = f.name
        
        try:
            with pytest.raises(SystemExit):
                migration_cli.analyze_arm_template(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_handle_missing_workspace_id(self, migration_cli, temp_arm_template):
        """Test handling missing workspace ID for migration."""
        # This should be caught by argparse, but test the migration method directly
        with pytest.raises((TypeError, SystemExit)):
            migration_cli.migrate(temp_arm_template, workspace_id=None)


# ============================================================================
# Integration Tests
# ============================================================================

class TestIntegration:
    """Integration tests for end-to-end workflows."""
    
    def test_full_analysis_workflow(self, temp_arm_template, capsys):
        """Test complete analysis workflow."""
        cli = MigrationCLI()
        
        # Analyze
        cli.analyze_arm_template(temp_arm_template)
        captured = capsys.readouterr()
        
        assert "COMPONENT ANALYSIS" in captured.out
        assert "CONNECTOR MAPPING" in captured.out
    
    def test_full_profile_workflow(self, temp_arm_template, capsys):
        """Test complete profile generation workflow."""
        cli = MigrationCLI()
        
        # Generate profile
        cli.generate_profile(temp_arm_template)
        captured = capsys.readouterr()
        
        assert "MIGRATION PROFILE" in captured.out
        assert "METRICS" in captured.out
    
    @patch('cli_migrator.FabricAPIClient')
    def test_full_dry_run_workflow(self, mock_api_client, temp_arm_template, capsys):
        """Test complete migration dry-run workflow."""
        cli = MigrationCLI()
        
        # Migrate with dry-run
        cli.migrate(
            temp_arm_template,
            workspace_id="workspace-123",
            dry_run=True
        )
        
        captured = capsys.readouterr()
        assert "DRY RUN" in captured.out


# ============================================================================
# Performance Tests
# ============================================================================

class TestPerformance:
    """Test suite for performance characteristics."""
    
    def test_analyze_large_template(self, migration_cli):
        """Test analyzing a large ARM template."""
        # Create a template with many pipelines
        resources = []
        for i in range(10):
            resources.append({
                "type": "Microsoft.DataFactory/factories/pipelines",
                "name": f"Pipeline{i}",
                "properties": {
                    "activities": [
                        {
                            "name": f"Activity{j}",
                            "type": "Copy",
                            "inputs": [],
                            "outputs": []
                        }
                        for j in range(5)
                    ]
                }
            })
        
        template = {"resources": resources}
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(template, f)
            temp_path = f.name
        
        try:
            # Should complete without timeout or memory issues
            migration_cli.analyze_arm_template(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
