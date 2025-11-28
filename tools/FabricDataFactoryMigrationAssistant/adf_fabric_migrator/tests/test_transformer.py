"""Tests for the PipelineTransformer class."""

import json
import pytest

from adf_fabric_migrator.transformer import PipelineTransformer
from adf_fabric_migrator.models import GlobalParameterReference


class TestPipelineTransformer:
    """Test suite for PipelineTransformer."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = PipelineTransformer()
    
    def test_transform_empty_definition(self):
        """Test transforming empty pipeline definition."""
        result = self.transformer.transform_pipeline_definition({})
        
        assert "properties" in result
        # Empty definition returns minimal structure
        # When there's no properties dict, we get an empty properties dict
        assert isinstance(result["properties"], dict)
    
    def test_transform_pipeline_with_activities(self):
        """Test transforming pipeline with activities."""
        definition = {
            "properties": {
                "activities": [
                    {"name": "Activity1", "type": "Wait", "typeProperties": {"waitTimeInSeconds": 10}},
                    {"name": "Activity2", "type": "SetVariable", "typeProperties": {"variableName": "test"}}
                ]
            }
        }
        
        result = self.transformer.transform_pipeline_definition(definition, "TestPipeline")
        
        assert len(result["properties"]["activities"]) == 2
        assert result["properties"]["activities"][0]["name"] == "Activity1"
        assert result["properties"]["activities"][1]["name"] == "Activity2"
    
    def test_transform_pipeline_parameters(self):
        """Test parameters are preserved."""
        definition = {
            "properties": {
                "activities": [],
                "parameters": {
                    "inputPath": {"type": "string"},
                    "outputPath": {"type": "string", "defaultValue": "/data"}
                }
            }
        }
        
        result = self.transformer.transform_pipeline_definition(definition)
        
        assert "inputPath" in result["properties"]["parameters"]
        assert "outputPath" in result["properties"]["parameters"]
    
    def test_transform_pipeline_variables(self):
        """Test variables are preserved."""
        definition = {
            "properties": {
                "activities": [],
                "variables": {
                    "tempVar": {"type": "string"},
                    "counter": {"type": "int", "defaultValue": 0}
                }
            }
        }
        
        result = self.transformer.transform_pipeline_definition(definition)
        
        assert "tempVar" in result["properties"]["variables"]
        assert "counter" in result["properties"]["variables"]
    
    def test_transform_execute_pipeline_to_invoke_pipeline(self):
        """Test ExecutePipeline is transformed to InvokePipeline."""
        definition = {
            "properties": {
                "activities": [
                    {
                        "name": "CallChild",
                        "type": "ExecutePipeline",
                        "typeProperties": {
                            "pipeline": {"referenceName": "ChildPipeline"},
                            "waitOnCompletion": True,
                            "parameters": {"param1": "value1"}
                        }
                    }
                ]
            }
        }
        
        result = self.transformer.transform_pipeline_definition(definition)
        activities = result["properties"]["activities"]
        
        assert len(activities) == 1
        assert activities[0]["type"] == "InvokePipeline"
        assert activities[0]["typeProperties"]["operationType"] == "InvokeFabricPipeline"
        assert activities[0]["typeProperties"]["waitOnCompletion"] is True
        assert activities[0]["_originalTargetPipeline"] == "ChildPipeline"
    
    def test_transform_activity_dependencies(self):
        """Test activity dependencies are transformed."""
        definition = {
            "properties": {
                "activities": [
                    {
                        "name": "Activity1",
                        "type": "Wait",
                        "dependsOn": []
                    },
                    {
                        "name": "Activity2",
                        "type": "Wait",
                        "dependsOn": [
                            {"activity": "Activity1", "dependencyConditions": ["Succeeded"]}
                        ]
                    }
                ]
            }
        }
        
        result = self.transformer.transform_pipeline_definition(definition)
        activities = result["properties"]["activities"]
        
        assert activities[1]["dependsOn"][0]["activity"] == "Activity1"
        assert "Succeeded" in activities[1]["dependsOn"][0]["dependencyConditions"]
    
    def test_transform_removes_adf_specific_properties(self):
        """Test ADF-specific properties are removed."""
        definition = {
            "properties": {
                "activities": [
                    {
                        "name": "TestActivity",
                        "type": "Wait",
                        "linkedServiceName": {"referenceName": "SomeLS"},
                        "connectVia": {"referenceName": "SomeIR"}
                    }
                ]
            }
        }
        
        result = self.transformer.transform_pipeline_definition(definition)
        activity = result["properties"]["activities"][0]
        
        assert "linkedServiceName" not in activity
        assert activity.get("connectVia") == {}


class TestPipelineTransformerGlobalParameters:
    """Test global parameter transformation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = PipelineTransformer()
    
    def test_inject_library_variables(self):
        """Test library variables injection."""
        definition = {
            "properties": {
                "activities": []
            }
        }
        
        variables = [("param1", "String"), ("param2", "Integer")]
        
        result = self.transformer.inject_library_variables(
            definition, 
            "TestLibrary", 
            variables
        )
        
        lib_vars = result["properties"]["libraryVariables"]
        
        assert "TestLibrary_VariableLibrary_param1" in lib_vars
        assert "TestLibrary_VariableLibrary_param2" in lib_vars
        assert lib_vars["TestLibrary_VariableLibrary_param1"]["type"] == "String"
        assert lib_vars["TestLibrary_VariableLibrary_param2"]["type"] == "Integer"
    
    def test_transform_global_parameter_expressions(self):
        """Test global parameter expression transformation."""
        definition = {
            "properties": {
                "activities": [
                    {
                        "name": "TestActivity",
                        "type": "Web",
                        "typeProperties": {
                            "url": "@pipeline().globalParameters.apiUrl",
                            "body": "@{pipeline().globalParameters.requestBody}"
                        }
                    }
                ]
            }
        }
        
        result = self.transformer.transform_global_parameter_expressions(
            definition,
            ["apiUrl", "requestBody"],
            "TestLibrary"
        )
        
        # Check transformation occurred
        result_str = json.dumps(result)
        
        assert "@pipeline().libraryVariables.TestLibrary_VariableLibrary_apiUrl" in result_str
        assert "@{pipeline().libraryVariables.TestLibrary_VariableLibrary_requestBody}" in result_str
        assert "@pipeline().globalParameters" not in result_str
    
    def test_transform_pipeline_with_global_parameters(self):
        """Test complete global parameter transformation."""
        definition = {
            "properties": {
                "activities": [
                    {
                        "name": "TestActivity",
                        "type": "Web",
                        "typeProperties": {
                            "url": "@pipeline().globalParameters.apiUrl"
                        }
                    }
                ]
            }
        }
        
        global_params = [
            GlobalParameterReference(
                name="apiUrl",
                adf_data_type="String",
                fabric_data_type="String",
                default_value="https://api.example.com",
                referenced_by_pipelines=["TestPipeline"]
            )
        ]
        
        result = self.transformer.transform_pipeline_with_global_parameters(
            definition,
            global_params,
            "TestLibrary"
        )
        
        # Check library variables injected
        assert "libraryVariables" in result["properties"]
        assert "TestLibrary_VariableLibrary_apiUrl" in result["properties"]["libraryVariables"]
        
        # Check expressions transformed
        result_str = json.dumps(result)
        assert "@pipeline().libraryVariables.TestLibrary_VariableLibrary_apiUrl" in result_str


class TestPipelineTransformerPayload:
    """Test Fabric payload generation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = PipelineTransformer()
    
    def test_generate_fabric_pipeline_payload(self):
        """Test payload generation."""
        definition = {
            "properties": {
                "activities": [
                    {"name": "TestActivity", "type": "Wait"}
                ]
            }
        }
        
        payload = self.transformer.generate_fabric_pipeline_payload(definition)
        
        # Payload should be base64 encoded
        import base64
        decoded = base64.b64decode(payload).decode("utf-8")
        parsed = json.loads(decoded)
        
        assert "properties" in parsed
        assert "activities" in parsed["properties"]
    
    def test_generate_payload_removes_metadata(self):
        """Test payload removes ADF metadata."""
        definition = {
            "properties": {
                "activities": []
            },
            "resourceMetadata": {"shouldBeRemoved": True},
            "dependsOn": ["something"]
        }
        
        payload = self.transformer.generate_fabric_pipeline_payload(definition)
        
        import base64
        decoded = base64.b64decode(payload).decode("utf-8")
        parsed = json.loads(decoded)
        
        assert "resourceMetadata" not in parsed
        assert "dependsOn" not in parsed
