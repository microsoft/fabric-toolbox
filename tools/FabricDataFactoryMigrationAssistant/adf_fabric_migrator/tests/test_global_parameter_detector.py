"""Tests for the GlobalParameterDetector class."""

import json
import pytest

from adf_fabric_migrator.global_parameter_detector import GlobalParameterDetector
from adf_fabric_migrator.models import ADFComponent, ComponentType


class TestGlobalParameterDetector:
    """Test suite for GlobalParameterDetector."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def _create_pipeline_component(
        self, name: str, activities: list, global_param_refs: list = None
    ) -> ADFComponent:
        """Helper to create a pipeline component."""
        return ADFComponent(
            name=name,
            type=ComponentType.PIPELINE,
            definition={
                "type": "pipeline",
                "properties": {
                    "activities": activities,
                },
            },
        )


class TestDetectGlobalParameters:
    """Test detect_global_parameters method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def test_detect_no_global_parameters(self):
        """Test detection when no global parameters exist."""
        components = [
            ADFComponent(
                name="SimplePipeline",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {"name": "Wait", "type": "Wait", "typeProperties": {"waitTimeInSeconds": 10}}
                        ],
                    },
                },
            )
        ]

        refs = self.detector.detect_global_parameters(components)
        assert len(refs) == 0

    def test_detect_primary_pattern(self):
        """Test detection using primary @pipeline().globalParameters.X pattern."""
        components = [
            ADFComponent(
                name="PipelineWithGlobalParams",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "WebActivity",
                                "type": "WebActivity",
                                "typeProperties": {
                                    "url": "@pipeline().globalParameters.apiUrl",
                                    "method": "GET",
                                },
                            }
                        ],
                    },
                },
            )
        ]

        refs = self.detector.detect_global_parameters(components)

        assert len(refs) == 1
        assert refs[0].name == "apiUrl"
        assert "PipelineWithGlobalParams" in refs[0].referenced_by_pipelines

    def test_detect_alternative_pattern(self):
        """Test detection using @{pipeline().globalParameters.X} pattern."""
        components = [
            ADFComponent(
                name="PipelineWithGlobalParams",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "WebActivity",
                                "type": "WebActivity",
                                "typeProperties": {
                                    "body": "@{pipeline().globalParameters.requestBody}",
                                },
                            }
                        ],
                    },
                },
            )
        ]

        refs = self.detector.detect_global_parameters(components)

        assert len(refs) == 1
        assert refs[0].name == "requestBody"

    def test_detect_nested_pattern(self):
        """Test detection using nested pipeline().globalParameters.X pattern."""
        components = [
            ADFComponent(
                name="PipelineWithGlobalParams",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "SetVariable",
                                "type": "SetVariable",
                                "typeProperties": {
                                    "value": "@concat('prefix_', pipeline().globalParameters.configValue)",
                                },
                            }
                        ],
                    },
                },
            )
        ]

        refs = self.detector.detect_global_parameters(components)

        assert len(refs) == 1
        assert refs[0].name == "configValue"

    def test_detect_multiple_parameters(self):
        """Test detection of multiple global parameters."""
        components = [
            ADFComponent(
                name="MultiParamPipeline",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "WebActivity",
                                "type": "WebActivity",
                                "typeProperties": {
                                    "url": "@pipeline().globalParameters.apiUrl",
                                    "headers": {
                                        "Authorization": "@pipeline().globalParameters.apiKey",
                                    },
                                    "body": "@{pipeline().globalParameters.requestBody}",
                                },
                            }
                        ],
                    },
                },
            )
        ]

        refs = self.detector.detect_global_parameters(components)

        assert len(refs) == 3
        param_names = {r.name for r in refs}
        assert param_names == {"apiUrl", "apiKey", "requestBody"}

    def test_detect_same_parameter_in_multiple_pipelines(self):
        """Test that same parameter in multiple pipelines is merged."""
        components = [
            ADFComponent(
                name="Pipeline1",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "Activity1",
                                "type": "WebActivity",
                                "typeProperties": {
                                    "url": "@pipeline().globalParameters.sharedApiUrl",
                                },
                            }
                        ],
                    },
                },
            ),
            ADFComponent(
                name="Pipeline2",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "Activity2",
                                "type": "WebActivity",
                                "typeProperties": {
                                    "url": "@pipeline().globalParameters.sharedApiUrl",
                                },
                            }
                        ],
                    },
                },
            ),
        ]

        refs = self.detector.detect_global_parameters(components)

        assert len(refs) == 1
        assert refs[0].name == "sharedApiUrl"
        assert "Pipeline1" in refs[0].referenced_by_pipelines
        assert "Pipeline2" in refs[0].referenced_by_pipelines

    def test_detect_ignores_non_pipeline_components(self):
        """Test that non-pipeline components are ignored."""
        components = [
            ADFComponent(
                name="Dataset1",
                type=ComponentType.DATASET,
                definition={
                    "type": "dataset",
                    "properties": {"type": "AzureBlob"},
                },
            ),
            ADFComponent(
                name="LinkedService1",
                type=ComponentType.LINKED_SERVICE,
                definition={
                    "type": "linkedService",
                    "properties": {"type": "AzureBlobStorage"},
                },
            ),
        ]

        refs = self.detector.detect_global_parameters(components)
        assert len(refs) == 0


class TestDetectFromArmTemplate:
    """Test detect_from_arm_template method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def test_detect_from_arm_template_with_global_parameters(self):
        """Test extraction from ARM template globalParameters section."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {
                        "globalParameters": {
                            "apiUrl": {"type": "String", "value": "https://api.example.com"},
                            "maxRetries": {"type": "Int", "value": 3},
                            "isEnabled": {"type": "Bool", "value": True},
                            "threshold": {"type": "Float", "value": 0.75},
                        },
                    },
                }
            ]
        }

        refs = self.detector.detect_from_arm_template(arm_template)

        assert len(refs) == 4

        # Check specific parameters
        api_url_ref = next(r for r in refs if r.name == "apiUrl")
        assert api_url_ref.adf_data_type == "String"
        assert api_url_ref.fabric_data_type == "String"
        assert api_url_ref.default_value == "https://api.example.com"

        max_retries_ref = next(r for r in refs if r.name == "maxRetries")
        assert max_retries_ref.adf_data_type == "Int"
        assert max_retries_ref.fabric_data_type == "Integer"
        assert max_retries_ref.default_value == 3

        is_enabled_ref = next(r for r in refs if r.name == "isEnabled")
        assert is_enabled_ref.adf_data_type == "Bool"
        assert is_enabled_ref.fabric_data_type == "Boolean"
        assert is_enabled_ref.default_value is True

        threshold_ref = next(r for r in refs if r.name == "threshold")
        assert threshold_ref.adf_data_type == "Float"
        assert threshold_ref.fabric_data_type == "Number"
        assert threshold_ref.default_value == 0.75

    def test_detect_secure_string_parameter(self):
        """Test detection of SecureString parameter."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {
                        "globalParameters": {
                            "secretKey": {"type": "SecureString", "value": "***"},
                        },
                    },
                }
            ]
        }

        refs = self.detector.detect_from_arm_template(arm_template)

        assert len(refs) == 1
        assert refs[0].name == "secretKey"
        assert refs[0].is_secure is True
        assert refs[0].fabric_data_type == "String"

    def test_detect_from_arm_template_no_factory(self):
        """Test with ARM template containing no factory resource."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories/pipelines",
                    "name": "SomePipeline",
                    "properties": {},
                }
            ]
        }

        refs = self.detector.detect_from_arm_template(arm_template)
        assert len(refs) == 0

    def test_detect_from_arm_template_no_global_parameters(self):
        """Test with factory without globalParameters."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {},
                }
            ]
        }

        refs = self.detector.detect_from_arm_template(arm_template)
        assert len(refs) == 0

    def test_detect_from_arm_template_array_type(self):
        """Test Array type is mapped to String in Fabric."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {
                        "globalParameters": {
                            "allowedValues": {"type": "Array", "value": ["a", "b", "c"]},
                        },
                    },
                }
            ]
        }

        refs = self.detector.detect_from_arm_template(arm_template)

        assert len(refs) == 1
        assert refs[0].adf_data_type == "Array"
        assert refs[0].fabric_data_type == "String"

    def test_detect_from_arm_template_object_type(self):
        """Test Object type is mapped to String in Fabric."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {
                        "globalParameters": {
                            "config": {"type": "Object", "value": {"key": "value"}},
                        },
                    },
                }
            ]
        }

        refs = self.detector.detect_from_arm_template(arm_template)

        assert len(refs) == 1
        assert refs[0].adf_data_type == "Object"
        assert refs[0].fabric_data_type == "String"


class TestDetectWithFallback:
    """Test detect_with_fallback method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def test_detect_with_fallback_merges_results(self):
        """Test that fallback merges expression and ARM template results."""
        components = [
            ADFComponent(
                name="Pipeline1",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "Activity1",
                                "type": "WebActivity",
                                "typeProperties": {
                                    "url": "@pipeline().globalParameters.apiUrl",
                                },
                            }
                        ],
                    },
                },
            )
        ]

        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {
                        "globalParameters": {
                            "apiUrl": {"type": "String", "value": "https://api.example.com"},
                            "unusedParam": {"type": "Int", "value": 42},
                        },
                    },
                }
            ]
        }

        refs = self.detector.detect_with_fallback(components, arm_template)

        assert len(refs) == 2

        # apiUrl should have merged metadata
        api_url_ref = next(r for r in refs if r.name == "apiUrl")
        assert api_url_ref.default_value == "https://api.example.com"
        assert "Pipeline1" in api_url_ref.referenced_by_pipelines

        # unusedParam should exist from ARM template
        unused_ref = next(r for r in refs if r.name == "unusedParam")
        assert unused_ref.default_value == 42
        assert len(unused_ref.referenced_by_pipelines) == 0

    def test_detect_with_fallback_prefers_arm_metadata(self):
        """Test that ARM template metadata is preferred over expression defaults."""
        components = [
            ADFComponent(
                name="Pipeline1",
                type=ComponentType.PIPELINE,
                definition={
                    "type": "pipeline",
                    "properties": {
                        "activities": [
                            {
                                "name": "Activity1",
                                "type": "WebActivity",
                                "typeProperties": {
                                    "url": "@pipeline().globalParameters.apiUrl",
                                },
                            }
                        ],
                    },
                },
            )
        ]

        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {
                        "globalParameters": {
                            "apiUrl": {"type": "String", "value": "https://api.prod.example.com"},
                        },
                    },
                }
            ]
        }

        refs = self.detector.detect_with_fallback(components, arm_template)

        assert len(refs) == 1
        # Should have ARM template's value and expression's pipeline references
        assert refs[0].default_value == "https://api.prod.example.com"
        assert "Pipeline1" in refs[0].referenced_by_pipelines


class TestExtractFactoryName:
    """Test extract_factory_name method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def test_extract_factory_name_direct(self):
        """Test extracting factory name from direct value."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyProductionFactory",
                    "properties": {},
                }
            ]
        }

        name = self.detector.extract_factory_name(arm_template)
        assert name == "MyProductionFactory"

    def test_extract_factory_name_from_parameter(self):
        """Test extracting factory name from parameter reference."""
        arm_template = {
            "parameters": {
                "factoryName": {"defaultValue": "ParameterizedFactory"},
            },
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "[parameters('factoryName')]",
                    "properties": {},
                }
            ],
        }

        name = self.detector.extract_factory_name(arm_template)
        assert name == "ParameterizedFactory"

    def test_extract_factory_name_fallback(self):
        """Test factory name fallback when not found."""
        arm_template = {"resources": []}

        name = self.detector.extract_factory_name(arm_template)
        assert name == "DataFactory"

    def test_extract_factory_name_no_factory_resource(self):
        """Test fallback when no factory resource exists."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories/pipelines",
                    "name": "SomePipeline",
                    "properties": {},
                }
            ]
        }

        name = self.detector.extract_factory_name(arm_template)
        assert name == "DataFactory"


class TestGetVariableLibraryName:
    """Test get_variable_library_name method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def test_get_variable_library_name_default_suffix(self):
        """Test getting variable library name with default suffix."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {},
                }
            ]
        }

        name = self.detector.get_variable_library_name(arm_template)
        assert name == "MyFactory_GlobalParameters"

    def test_get_variable_library_name_custom_suffix(self):
        """Test getting variable library name with custom suffix."""
        arm_template = {
            "resources": [
                {
                    "type": "Microsoft.DataFactory/factories",
                    "name": "MyFactory",
                    "properties": {},
                }
            ]
        }

        name = self.detector.get_variable_library_name(arm_template, suffix="Variables")
        assert name == "MyFactory_Variables"


class TestTypeMappings:
    """Test ADF to Fabric type mappings."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def test_map_string_type(self):
        """Test String type mapping."""
        assert self.detector._map_adf_type_to_fabric("String") == "String"

    def test_map_int_type(self):
        """Test Int type mapping."""
        assert self.detector._map_adf_type_to_fabric("Int") == "Integer"

    def test_map_float_type(self):
        """Test Float type mapping."""
        assert self.detector._map_adf_type_to_fabric("Float") == "Number"

    def test_map_bool_type(self):
        """Test Bool type mapping."""
        assert self.detector._map_adf_type_to_fabric("Bool") == "Boolean"

    def test_map_array_type(self):
        """Test Array type mapping."""
        assert self.detector._map_adf_type_to_fabric("Array") == "String"

    def test_map_object_type(self):
        """Test Object type mapping."""
        assert self.detector._map_adf_type_to_fabric("Object") == "String"

    def test_map_secure_string_type(self):
        """Test SecureString type mapping."""
        assert self.detector._map_adf_type_to_fabric("SecureString") == "String"

    def test_map_unknown_type(self):
        """Test unknown type defaults to String."""
        assert self.detector._map_adf_type_to_fabric("UnknownType") == "String"


class TestCreateReferenceStub:
    """Test _create_reference_stub method."""

    def setup_method(self):
        """Set up test fixtures."""
        self.detector = GlobalParameterDetector()

    def test_create_reference_stub(self):
        """Test creating a reference stub."""
        ref = self.detector._create_reference_stub("testParam")

        assert ref.name == "testParam"
        assert ref.adf_data_type == "String"
        assert ref.fabric_data_type == "String"
        assert ref.default_value == ""
        assert ref.referenced_by_pipelines == []
        assert ref.is_secure is False
        assert "Detected from pipeline expressions" in ref.note
