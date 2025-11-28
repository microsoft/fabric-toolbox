"""Tests for the ADFParser class."""

import json
import pytest

from adf_fabric_migrator.parser import ADFParser
from adf_fabric_migrator.models import ComponentType, CompatibilityStatus


# Sample ARM template for testing
SAMPLE_ARM_TEMPLATE = {
    "resources": [
        {
            "type": "Microsoft.DataFactory/factories",
            "name": "MyDataFactory",
            "properties": {},
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories/pipelines",
                    "name": "[concat(parameters('factoryName'), '/TestPipeline')]",
                    "properties": {
                        "activities": [
                            {
                                "name": "CopyData",
                                "type": "Copy",
                                "inputs": [{"referenceName": "SourceDataset", "type": "DatasetReference"}],
                                "outputs": [{"referenceName": "SinkDataset", "type": "DatasetReference"}],
                                "typeProperties": {}
                            },
                            {
                                "name": "LookupData",
                                "type": "Lookup",
                                "typeProperties": {}
                            }
                        ],
                        "parameters": {
                            "inputPath": {"type": "string"}
                        },
                        "variables": {
                            "tempVar": {"type": "string"}
                        },
                        "folder": {"name": "Production/ETL"}
                    }
                },
                {
                    "type": "Microsoft.DataFactory/factories/datasets",
                    "name": "[concat(parameters('factoryName'), '/SourceDataset')]",
                    "properties": {
                        "type": "AzureBlob",
                        "linkedServiceName": {
                            "referenceName": "AzureBlobLS",
                            "type": "LinkedServiceReference"
                        },
                        "typeProperties": {
                            "folderPath": "data/input"
                        }
                    }
                },
                {
                    "type": "Microsoft.DataFactory/factories/linkedServices",
                    "name": "[concat(parameters('factoryName'), '/AzureBlobLS')]",
                    "properties": {
                        "type": "AzureBlobStorage",
                        "typeProperties": {
                            "connectionString": "DefaultEndpointsProtocol=https;..."
                        }
                    }
                },
                {
                    "type": "Microsoft.DataFactory/factories/triggers",
                    "name": "[concat(parameters('factoryName'), '/DailyTrigger')]",
                    "properties": {
                        "type": "ScheduleTrigger",
                        "runtimeState": "Started",
                        "typeProperties": {
                            "recurrence": {
                                "frequency": "Day",
                                "interval": 1,
                                "startTime": "2024-01-01T00:00:00Z",
                                "timeZone": "UTC"
                            }
                        },
                        "pipelines": [
                            {
                                "pipelineReference": {
                                    "referenceName": "TestPipeline",
                                    "type": "PipelineReference"
                                }
                            }
                        ]
                    }
                }
            ]
        }
    ]
}


class TestADFParser:
    """Test suite for ADFParser."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.parser = ADFParser()
    
    def test_parse_arm_template_valid(self):
        """Test parsing a valid ARM template."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        assert len(components) >= 4  # At least pipeline, dataset, linkedService, trigger
        
        # Check component types
        types = [c.type for c in components]
        assert ComponentType.PIPELINE in types
        assert ComponentType.DATASET in types
        assert ComponentType.LINKED_SERVICE in types
        assert ComponentType.TRIGGER in types
    
    def test_parse_arm_template_invalid_json(self):
        """Test parsing invalid JSON raises error."""
        with pytest.raises(ValueError, match="Invalid JSON"):
            self.parser.parse_arm_template("not valid json")
    
    def test_parse_arm_template_missing_resources(self):
        """Test parsing template without resources raises error."""
        with pytest.raises(ValueError, match="Invalid ARM template"):
            self.parser.parse_arm_template('{"notResources": []}')
    
    def test_parse_pipeline_properties(self):
        """Test pipeline properties are extracted correctly."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        pipeline = next(c for c in components if c.type == ComponentType.PIPELINE)
        
        assert pipeline.name == "TestPipeline"
        assert "activities" in pipeline.definition.get("properties", {})
        assert "parameters" in pipeline.definition.get("properties", {})
        assert "variables" in pipeline.definition.get("properties", {})
    
    def test_parse_pipeline_folder(self):
        """Test pipeline folder extraction."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        pipeline = next(c for c in components if c.type == ComponentType.PIPELINE)
        
        assert pipeline.folder is not None
        assert pipeline.folder.path == "Production/ETL"
        assert pipeline.folder.depth == 1
        assert pipeline.folder.segments == ["Production", "ETL"]
    
    def test_parse_dataset_linked_service_reference(self):
        """Test dataset linked service reference extraction."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        dataset = next(c for c in components if c.type == ComponentType.DATASET)
        
        ls_ref = dataset.definition.get("properties", {}).get("linkedServiceName", {})
        assert ls_ref.get("referenceName") == "AzureBlobLS"
    
    def test_parse_trigger_metadata(self):
        """Test trigger metadata extraction."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        trigger = next(c for c in components if c.type == ComponentType.TRIGGER)
        
        assert trigger.trigger_metadata is not None
        assert trigger.trigger_metadata.type == "ScheduleTrigger"
        assert trigger.trigger_metadata.runtime_state == "Started"
        assert trigger.trigger_metadata.recurrence is not None
        assert trigger.trigger_metadata.recurrence.frequency == "Day"
        assert "TestPipeline" in trigger.trigger_metadata.referenced_pipelines
    
    def test_parse_component_fabric_target(self):
        """Test Fabric target generation."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        pipeline = next(c for c in components if c.type == ComponentType.PIPELINE)
        
        assert pipeline.fabric_target is not None
        assert pipeline.fabric_target.type.value == "dataPipeline"
        assert pipeline.fabric_target.name == "TestPipeline"
    
    def test_get_component_summary(self):
        """Test component summary generation."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        summary = self.parser.get_component_summary(components)
        
        assert summary.total >= 4
        assert summary.by_type.get("pipeline", 0) >= 1
        assert summary.by_type.get("dataset", 0) >= 1
        assert summary.by_type.get("linkedService", 0) >= 1
        assert summary.by_type.get("trigger", 0) >= 1
    
    def test_get_dataset_by_name(self):
        """Test getting dataset by name."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        self.parser.parse_arm_template(content)
        
        dataset = self.parser.get_dataset_by_name("SourceDataset")
        
        assert dataset is not None
        assert dataset.name == "SourceDataset"
        assert dataset.type == ComponentType.DATASET
    
    def test_get_linked_service_by_name(self):
        """Test getting linked service by name."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        self.parser.parse_arm_template(content)
        
        ls = self.parser.get_linked_service_by_name("AzureBlobLS")
        
        assert ls is not None
        assert ls.name == "AzureBlobLS"
        assert ls.type == ComponentType.LINKED_SERVICE
    
    def test_get_components_by_type(self):
        """Test getting components by type."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        self.parser.parse_arm_template(content)
        
        pipelines = self.parser.get_components_by_type(ComponentType.PIPELINE)
        
        assert len(pipelines) >= 1
        assert all(c.type == ComponentType.PIPELINE for c in pipelines)
    
    def test_parse_validation_rules(self):
        """Test validation rules are applied."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        # Pipelines should be supported
        pipeline = next(c for c in components if c.type == ComponentType.PIPELINE)
        assert pipeline.compatibility_status == CompatibilityStatus.SUPPORTED
        assert pipeline.is_selected is True


class TestADFParserSynapseSupport:
    """Test Synapse workspace parsing support."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.parser = ADFParser()
    
    def test_parse_synapse_pipeline(self):
        """Test parsing Synapse pipeline."""
        template = {
            "resources": [
                {
                    "type": "Microsoft.Synapse/workspaces/pipelines",
                    "name": "workspace/SynapsePipeline",
                    "properties": {
                        "activities": [
                            {"name": "TestActivity", "type": "Wait", "typeProperties": {"waitTimeInSeconds": 10}}
                        ]
                    }
                }
            ]
        }
        
        components = self.parser.parse_arm_template(json.dumps(template))
        
        assert len(components) == 1
        assert components[0].type == ComponentType.PIPELINE
        assert components[0].name == "SynapsePipeline"
        assert components[0].definition.get("resourceMetadata", {}).get("synapseWorkspace") is True


class TestADFParserProfile:
    """Test profile generation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.parser = ADFParser()
    
    def test_generate_profile(self):
        """Test profile generation."""
        content = json.dumps(SAMPLE_ARM_TEMPLATE)
        components = self.parser.parse_arm_template(content)
        
        profile = self.parser.generate_profile(components, "test.json", 1024)
        
        assert profile.metadata["fileName"] == "test.json"
        assert profile.metadata["fileSize"] == 1024
        
        assert profile.metrics.total_pipelines >= 1
        assert profile.metrics.total_datasets >= 1
        assert profile.metrics.total_linked_services >= 1
        assert profile.metrics.total_triggers >= 1
        
        assert len(profile.artifacts.pipelines) >= 1
        assert len(profile.artifacts.datasets) >= 1
        
        assert len(profile.dependencies.nodes) > 0
        assert len(profile.dependencies.edges) >= 0
        
        assert len(profile.insights) > 0
