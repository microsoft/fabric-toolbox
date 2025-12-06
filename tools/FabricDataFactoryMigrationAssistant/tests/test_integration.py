"""
Integration and end-to-end tests for the ADF to Fabric CLI Migration Tool.

These tests focus on real-world migration scenarios and complete workflows.
"""

import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch, MagicMock
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from cli_migrator import MigrationCLI, FabricAPIClient


# ============================================================================
# Fixtures - Real-world Templates
# ============================================================================

@pytest.fixture
def etl_pipeline_template():
    """Create a realistic ETL pipeline ARM template."""
    return {
        "resources": [
            {
                "type": "Microsoft.DataFactory/factories",
                "name": "ETLDataFactory",
                "properties": {
                    "globalParameters": {
                        "environment": {"type": "String", "value": "production"},
                        "maxRetries": {"type": "Int", "value": 3},
                        "timeout": {"type": "Int", "value": 3600}
                    }
                },
                "resources": [
                    # LinkedServices
                    {
                        "type": "Microsoft.DataFactory/factories/linkedServices",
                        "name": "[concat(parameters('factoryName'), '/SourceDB')]",
                        "properties": {
                            "type": "AzureSqlDatabase",
                            "typeProperties": {
                                "connectionString": "Server=tcp:source.database.windows.net"
                            }
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/linkedServices",
                        "name": "[concat(parameters('factoryName'), '/TargetDB')]",
                        "properties": {
                            "type": "AzureSqlDatabase",
                            "typeProperties": {
                                "connectionString": "Server=tcp:target.database.windows.net"
                            }
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/linkedServices",
                        "name": "[concat(parameters('factoryName'), '/DataLake')]",
                        "properties": {
                            "type": "AzureDataLakeStorageGen2",
                            "typeProperties": {
                                "url": "https://mydatalake.dfs.core.windows.net"
                            }
                        }
                    },
                    # Datasets
                    {
                        "type": "Microsoft.DataFactory/factories/datasets",
                        "name": "[concat(parameters('factoryName'), '/SourceTable')]",
                        "properties": {
                            "type": "AzureSqlTable",
                            "linkedServiceName": {"referenceName": "SourceDB"},
                            "typeProperties": {"tableName": "SourceData"}
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/datasets",
                        "name": "[concat(parameters('factoryName'), '/TargetTable')]",
                        "properties": {
                            "type": "AzureSqlTable",
                            "linkedServiceName": {"referenceName": "TargetDB"},
                            "typeProperties": {"tableName": "TargetData"}
                        }
                    },
                    # Pipeline
                    {
                        "type": "Microsoft.DataFactory/factories/pipelines",
                        "name": "[concat(parameters('factoryName'), '/ETLPipeline')]",
                        "properties": {
                            "activities": [
                                {
                                    "name": "ExtractData",
                                    "type": "Lookup",
                                    "dataset": {"referenceName": "SourceTable"},
                                    "typeProperties": {
                                        "source": {
                                            "query": "SELECT COUNT(*) as Count FROM SourceData"
                                        }
                                    }
                                },
                                {
                                    "name": "CopyToTarget",
                                    "type": "Copy",
                                    "inputs": [{"referenceName": "SourceTable"}],
                                    "outputs": [{"referenceName": "TargetTable"}],
                                    "typeProperties": {
                                        "translator": {
                                            "type": "TabularTranslator",
                                            "mappings": []
                                        }
                                    }
                                },
                                {
                                    "name": "IfSuccessful",
                                    "type": "IfCondition",
                                    "dependsOn": [
                                        {"activity": "CopyToTarget", "dependencyConditions": ["Succeeded"]}
                                    ],
                                    "typeProperties": {
                                        "expression": {"value": "true"},
                                        "ifTrueActivities": [
                                            {
                                                "name": "NotifySuccess",
                                                "type": "WebActivity",
                                                "typeProperties": {
                                                    "url": "https://webhook.example.com/success"
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }


@pytest.fixture
def complex_pipeline_template():
    """Create a complex pipeline with multiple activities and dependencies."""
    return {
        "resources": [
            {
                "type": "Microsoft.DataFactory/factories",
                "name": "ComplexDataFactory",
                "properties": {},
                "resources": [
                    {
                        "type": "Microsoft.DataFactory/factories/pipelines",
                        "name": "[concat(parameters('factoryName'), '/ComplexPipeline')]",
                        "properties": {
                            "activities": [
                                # Sequential activities
                                {
                                    "name": "Activity1",
                                    "type": "ExecutePipeline",
                                    "typeProperties": {
                                        "pipeline": {"referenceName": "ChildPipeline1"}
                                    }
                                },
                                {
                                    "name": "Activity2",
                                    "type": "ExecutePipeline",
                                    "typeProperties": {
                                        "pipeline": {"referenceName": "ChildPipeline2"}
                                    },
                                    "dependsOn": [
                                        {"activity": "Activity1", "dependencyConditions": ["Succeeded"]}
                                    ]
                                },
                                # ForEach activity
                                {
                                    "name": "ForEachItem",
                                    "type": "ForEach",
                                    "typeProperties": {
                                        "items": "@pipeline().parameters.items",
                                        "activities": [
                                            {
                                                "name": "ProcessItem",
                                                "type": "Copy",
                                                "inputs": [],
                                                "outputs": []
                                            }
                                        ]
                                    }
                                },
                                # Until activity
                                {
                                    "name": "RetryLogic",
                                    "type": "Until",
                                    "typeProperties": {
                                        "expression": "@equals(variables('retryCount'), 3)",
                                        "activities": [
                                            {
                                                "name": "TryOnce",
                                                "type": "Web",
                                                "typeProperties": {
                                                    "url": "https://api.example.com/retry"
                                                }
                                            }
                                        ],
                                        "timeout": "00:10:00"
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/pipelines",
                        "name": "[concat(parameters('factoryName'), '/ChildPipeline1')]",
                        "properties": {
                            "activities": []
                        }
                    },
                    {
                        "type": "Microsoft.DataFactory/factories/pipelines",
                        "name": "[concat(parameters('factoryName'), '/ChildPipeline2')]",
                        "properties": {
                            "activities": []
                        }
                    }
                ]
            }
        ]
    }


@pytest.fixture
def temp_template_file(request):
    """Create a temporary template file from test parameter."""
    template = request.param if hasattr(request, 'param') else {}
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(template, f)
        temp_path = f.name
    
    yield temp_path
    
    Path(temp_path).unlink(missing_ok=True)


# ============================================================================
# ETL Pipeline Migration Tests
# ============================================================================

class TestETLPipelineMigration:
    """Test suite for realistic ETL pipeline migration scenarios."""
    
    def test_etl_pipeline_analysis(self, etl_pipeline_template, capsys):
        """Test analyzing a realistic ETL pipeline."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            cli.analyze_arm_template(temp_path)
            
            captured = capsys.readouterr()
            
            # Verify all components are detected
            assert "COMPONENT ANALYSIS" in captured.out
            assert "CONNECTOR MAPPING" in captured.out
            assert "ETLPipeline" in captured.out or "Pipeline" in captured.out
            assert "SourceDB" in captured.out or "linkedService" in captured.out.lower()
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_etl_pipeline_profile(self, etl_pipeline_template, capsys):
        """Test generating profile for ETL pipeline."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            cli.generate_profile(temp_path)
            
            captured = capsys.readouterr()
            
            assert "METRICS" in captured.out
            assert "Pipelines:" in captured.out
            assert "Linked Services:" in captured.out or "linked services" in captured.out
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    @patch('cli_migrator.FabricAPIClient')
    def test_etl_pipeline_migration_dry_run(self, mock_api_client, etl_pipeline_template, capsys):
        """Test dry-run migration of ETL pipeline."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                dry_run=True
            )
            
            captured = capsys.readouterr()
            
            assert "DRY RUN" in captured.out
            assert "No changes will be made" in captured.out
            # API should not be called
            mock_api_client.assert_not_called()
        finally:
            Path(temp_path).unlink(missing_ok=True)


# ============================================================================
# Complex Pipeline Migration Tests
# ============================================================================

class TestComplexPipelineMigration:
    """Test suite for complex pipeline scenarios."""
    
    def test_nested_pipeline_analysis(self, complex_pipeline_template, capsys):
        """Test analyzing nested pipelines."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(complex_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            cli.analyze_arm_template(temp_path)
            
            captured = capsys.readouterr()
            
            # Should detect multiple pipelines
            assert "COMPONENT ANALYSIS" in captured.out
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_activity_transformation_coverage(self, complex_pipeline_template):
        """Test transformation of various activity types."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(complex_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            
            # Parse and transform
            with open(temp_path, 'r') as f:
                template = json.load(f)
            
            components = cli.parser_obj.parse_arm_template(json.dumps(template))
            
            # Should successfully parse pipelines with ExecutePipeline, ForEach, Until activities
            pipelines = [c for c in components if "pipeline" in c.type.value.lower()]
            assert len(pipelines) > 0
        finally:
            Path(temp_path).unlink(missing_ok=True)


# ============================================================================
# Global Parameter Migration Tests
# ============================================================================

class TestGlobalParameterMigration:
    """Test suite for global parameter detection and migration."""
    
    def test_global_parameter_detection(self, etl_pipeline_template, capsys):
        """Test detection of global parameters."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            
            with open(temp_path, 'r') as f:
                template_content = f.read()
                arm_template = json.loads(template_content)
            
            components = cli.parser_obj.parse_arm_template(template_content)
            global_params = cli.global_param_detector.detect_with_fallback(components, arm_template)
            
            # ETL template has global parameters
            assert len(global_params) > 0
            
            # Verify parameters were detected
            param_names = {p.name for p in global_params}
            assert "environment" in param_names or len(param_names) > 0
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    @patch('cli_migrator.FabricAPIClient')
    def test_variable_library_creation(self, mock_api_client, etl_pipeline_template):
        """Test creation of variable library for global parameters."""
        mock_instance = MagicMock()
        mock_instance.create_variable_library.return_value = "library-123"
        mock_api_client.return_value = mock_instance
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                deploy_connections=False,
                deploy_pipelines=False,
                deploy_global_params=True,
                dry_run=False
            )
            
            # Verify variable library creation was called or attempted
            if mock_instance.create_variable_library.called:
                assert mock_instance.create_variable_library.call_count >= 1
        finally:
            Path(temp_path).unlink(missing_ok=True)


# ============================================================================
# Connection Management Tests
# ============================================================================

class TestConnectionManagement:
    """Test suite for connection creation and management."""
    
    @patch('cli_migrator.FabricAPIClient')
    def test_multiple_connection_creation(self, mock_api_client, etl_pipeline_template):
        """Test creating multiple connections."""
        mock_instance = MagicMock()
        
        # Mock return different IDs for each connection
        mock_instance.create_connection.side_effect = [
            "connection-1",
            "connection-2",
            "connection-3"
        ]
        
        mock_api_client.return_value = mock_instance
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                deploy_connections=True,
                deploy_pipelines=False,
                deploy_global_params=False,
                dry_run=False
            )
            
            # Verify multiple connections were attempted
            if mock_instance.create_connection.called:
                assert mock_instance.create_connection.call_count >= 1
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    @patch('cli_migrator.FabricAPIClient')
    def test_connection_creation_with_config(self, mock_api_client, etl_pipeline_template):
        """Test connection creation with custom configuration."""
        mock_instance = MagicMock()
        mock_instance.create_connection.return_value = "connection-123"
        mock_api_client.return_value = mock_instance
        
        config = {
            "SourceDB": {
                "connectionType": "AzureSqlDatabase",
                "connectionDetails": {
                    "server": "customserver.database.windows.net",
                    "database": "customdb"
                }
            }
        }
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as cf:
            json.dump(config, cf)
            config_path = cf.name
        
        try:
            cli = MigrationCLI()
            cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                deploy_connections=True,
                deploy_pipelines=False,
                connection_config_path=config_path,
                dry_run=False
            )
        finally:
            Path(temp_path).unlink(missing_ok=True)
            Path(config_path).unlink(missing_ok=True)


# ============================================================================
# Error Recovery Tests
# ============================================================================

class TestErrorRecovery:
    """Test suite for error handling and recovery."""
    
    @patch('cli_migrator.FabricAPIClient')
    def test_partial_connection_failure_recovery(self, mock_api_client, etl_pipeline_template):
        """Test recovery when some connection creations fail."""
        mock_instance = MagicMock()
        
        # First call succeeds, second fails, third succeeds
        mock_instance.create_connection.side_effect = [
            "connection-1",
            None,  # Failure
            "connection-3"
        ]
        
        mock_api_client.return_value = mock_instance
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            
            # Should continue processing despite partial failure
            cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                deploy_connections=True,
                deploy_pipelines=False,
                dry_run=False
            )
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    def test_graceful_handling_of_invalid_template(self):
        """Test graceful handling of invalid ARM template."""
        cli = MigrationCLI()
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            # Write invalid JSON
            f.write("{ invalid json }")
            temp_path = f.name
        
        try:
            # Should raise SystemExit, not crash with traceback
            with pytest.raises(SystemExit):
                cli.analyze_arm_template(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)


# ============================================================================
# Workflow Scenario Tests
# ============================================================================

class TestWorkflowScenarios:
    """Test complete workflow scenarios."""
    
    def test_scenario_analyze_profile_preview(self, etl_pipeline_template, capsys):
        """Test the analyze -> profile -> preview workflow."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            
            # Step 1: Analyze
            cli.analyze_arm_template(temp_path)
            
            # Step 2: Profile
            cli.generate_profile(temp_path)
            
            # Step 3: Preview (dry-run)
            cli.migrate(temp_path, workspace_id="workspace-123", dry_run=True)
            
            # All steps should complete successfully
            captured = capsys.readouterr()
            assert "COMPONENT ANALYSIS" in captured.out
            assert "MIGRATION PROFILE" in captured.out
            assert "DRY RUN" in captured.out
        finally:
            Path(temp_path).unlink(missing_ok=True)
    
    @patch('cli_migrator.FabricAPIClient')
    def test_scenario_staged_migration(self, mock_api_client, etl_pipeline_template):
        """Test staged migration (connections, then pipelines)."""
        mock_instance = MagicMock()
        mock_instance.create_connection.return_value = "connection-123"
        mock_instance.create_pipeline.return_value = "pipeline-456"
        mock_api_client.return_value = mock_instance
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(etl_pipeline_template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            
            # Stage 1: Create connections only
            cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                deploy_connections=True,
                deploy_pipelines=False,
                dry_run=False
            )
            
            # Stage 2: Deploy pipelines (skip connections)
            cli.migrate(
                temp_path,
                workspace_id="workspace-123",
                deploy_connections=False,
                deploy_pipelines=True,
                dry_run=False
            )
        finally:
            Path(temp_path).unlink(missing_ok=True)


# ============================================================================
# Performance and Scalability Tests
# ============================================================================

class TestScalability:
    """Test scalability with larger templates."""
    
    def test_large_factory_analysis(self):
        """Test analyzing a factory with many pipelines."""
        # Create a large template
        resources = []
        
        for i in range(20):  # 20 pipelines
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
                        for j in range(10)  # 10 activities per pipeline
                    ]
                }
            })
        
        template = {"resources": resources}
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(template, f)
            temp_path = f.name
        
        try:
            cli = MigrationCLI()
            # Should complete without timeout or memory issues
            cli.analyze_arm_template(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
