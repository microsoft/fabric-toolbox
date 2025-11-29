"""Tests for the ActivityTransformer class."""

import pytest

from adf_fabric_migrator.activity_transformer import ActivityTransformer


class TestActivityTransformer:
    """Test suite for ActivityTransformer."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()

    def test_transform_activity_empty_input(self):
        """Test transforming None or empty activity."""
        assert self.transformer.transform_activity(None) is None
        assert self.transformer.transform_activity({}) == {}

    def test_transform_activity_basic(self):
        """Test transforming a basic activity."""
        activity = {
            "name": "TestActivity",
            "type": "Wait",
            "typeProperties": {"waitTimeInSeconds": 10},
        }

        result = self.transformer.transform_activity(activity)

        assert result["name"] == "TestActivity"
        assert result["type"] == "Wait"
        assert result["typeProperties"]["waitTimeInSeconds"] == 10

    def test_transform_activity_skips_copy(self):
        """Test that Copy activity is not transformed."""
        activity = {
            "name": "CopyData",
            "type": "Copy",
            "typeProperties": {},
        }

        result = self.transformer.transform_activity(activity)

        # Should return activity unchanged
        assert result["type"] == "Copy"
        assert result["name"] == "CopyData"

    def test_transform_activity_skips_custom(self):
        """Test that Custom activity is not transformed."""
        activity = {
            "name": "CustomActivity",
            "type": "Custom",
            "typeProperties": {},
        }

        result = self.transformer.transform_activity(activity)

        # Should return activity unchanged
        assert result["type"] == "Custom"
        assert result["name"] == "CustomActivity"


class TestActivityTransformerLinkedServiceReferences:
    """Test LinkedService reference handling."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()
        self.transformer.set_connection_mappings({
            "AzureBlobLS": "connection-id-123",
            "SqlServerLS": "connection-id-456",
        })

    def test_removes_linked_service_name_and_sets_external_refs(self):
        """Test LinkedService removal and external reference creation."""
        activity = {
            "name": "TestActivity",
            "type": "Lookup",
            "linkedServiceName": {
                "referenceName": "AzureBlobLS",
                "type": "LinkedServiceReference",
            },
            "typeProperties": {},
        }

        result = self.transformer.transform_activity(activity)

        assert "linkedServiceName" not in result
        assert result.get("externalReferences", {}).get("connection") == "connection-id-123"

    def test_removes_linked_service_from_type_properties(self):
        """Test LinkedService removal from typeProperties."""
        activity = {
            "name": "TestActivity",
            "type": "Lookup",
            "typeProperties": {
                "linkedServiceName": {
                    "referenceName": "SqlServerLS",
                    "type": "LinkedServiceReference",
                },
            },
        }

        result = self.transformer.transform_activity(activity)

        assert "linkedServiceName" not in result.get("typeProperties", {})
        assert result.get("externalReferences", {}).get("connection") == "connection-id-456"

    def test_removes_linked_services_list(self):
        """Test LinkedServices list removal."""
        activity = {
            "name": "TestActivity",
            "type": "Notebook",
            "typeProperties": {
                "linkedServices": [
                    {"referenceName": "AzureBlobLS", "type": "LinkedServiceReference"},
                ],
            },
        }

        result = self.transformer.transform_activity(activity)

        assert "linkedServices" not in result.get("typeProperties", {})
        assert result.get("externalReferences", {}).get("connection") == "connection-id-123"

    def test_no_connection_mapping_logs_warning(self):
        """Test behavior when no connection mapping exists."""
        activity = {
            "name": "TestActivity",
            "type": "Lookup",
            "linkedServiceName": {
                "referenceName": "UnknownLS",
                "type": "LinkedServiceReference",
            },
            "typeProperties": {},
        }

        # Should not raise exception
        result = self.transformer.transform_activity(activity)

        # LinkedServiceName should be removed
        assert "linkedServiceName" not in result
        # No external reference should be set if no mapping found
        assert result.get("externalReferences", {}).get("connection") is None


class TestActivityTransformerExpressionConversion:
    """Test expression conversion functionality."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()

    def test_convert_script_expressions(self):
        """Test Script activity expression conversion."""
        activity = {
            "name": "RunScript",
            "type": "Script",
            "typeProperties": {
                "scripts": [
                    {"text": "SELECT * FROM table"},
                    {"text": "UPDATE table SET col = 1"},
                ],
            },
        }

        result = self.transformer.transform_activity(activity)

        scripts = result["typeProperties"]["scripts"]
        assert scripts[0]["text"] == {"value": "SELECT * FROM table", "type": "Expression"}
        assert scripts[1]["text"] == {"value": "UPDATE table SET col = 1", "type": "Expression"}

    def test_convert_stored_procedure_expressions(self):
        """Test StoredProcedure activity expression conversion."""
        activity = {
            "name": "RunStoredProc",
            "type": "StoredProcedure",
            "typeProperties": {
                "storedProcedureName": "sp_ProcessData",
                "storedProcedureParameters": {
                    "param1": "value1",
                    "param2": "value2",
                },
            },
        }

        result = self.transformer.transform_activity(activity)

        type_props = result["typeProperties"]
        assert type_props["storedProcedureName"] == {
            "value": "sp_ProcessData",
            "type": "Expression",
        }
        assert type_props["storedProcedureParameters"]["param1"] == {
            "value": "value1",
            "type": "Expression",
        }
        assert type_props["storedProcedureParameters"]["param2"] == {
            "value": "value2",
            "type": "Expression",
        }

    def test_convert_web_activity_expressions(self):
        """Test WebActivity expression conversion."""
        activity = {
            "name": "CallAPI",
            "type": "WebActivity",
            "typeProperties": {
                "url": "https://api.example.com/endpoint",
                "body": '{"key": "value"}',
            },
        }

        result = self.transformer.transform_activity(activity)

        type_props = result["typeProperties"]
        assert type_props["url"] == {"value": "https://api.example.com/endpoint", "type": "Expression"}
        assert type_props["body"] == {"value": '{"key": "value"}', "type": "Expression"}

    def test_convert_lookup_expressions(self):
        """Test Lookup activity expression conversion."""
        activity = {
            "name": "LookupData",
            "type": "Lookup",
            "typeProperties": {
                "source": {
                    "type": "SqlSource",
                    "query": "SELECT * FROM table WHERE id = 1",
                },
            },
        }

        result = self.transformer.transform_activity(activity)

        source = result["typeProperties"]["source"]
        assert source["query"] == {
            "value": "SELECT * FROM table WHERE id = 1",
            "type": "Expression",
        }

    def test_convert_common_string_expressions(self):
        """Test common string property expression conversion."""
        activity = {
            "name": "ExecuteQuery",
            "type": "SqlServerStoredProcedure",
            "typeProperties": {
                "query": "SELECT COUNT(*) FROM table",
            },
        }

        result = self.transformer.transform_activity(activity)

        assert result["typeProperties"]["query"] == {
            "value": "SELECT COUNT(*) FROM table",
            "type": "Expression",
        }


class TestActivityTransformerRequiredProperties:
    """Test required property injection."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()

    def test_add_script_timeout(self):
        """Test Script activity timeout injection."""
        activity = {
            "name": "RunScript",
            "type": "Script",
            "typeProperties": {},
        }

        result = self.transformer.transform_activity(activity)

        assert result["typeProperties"]["scriptBlockExecutionTimeout"] == "02:00:00"

    def test_add_web_activity_defaults(self):
        """Test WebActivity default properties injection."""
        activity = {
            "name": "CallAPI",
            "type": "WebActivity",
            "typeProperties": {},
        }

        result = self.transformer.transform_activity(activity)

        assert result["typeProperties"]["method"] == "GET"
        assert result["typeProperties"]["headers"] == {}

    def test_preserve_existing_web_activity_method(self):
        """Test WebActivity preserves existing method."""
        activity = {
            "name": "CallAPI",
            "type": "WebActivity",
            "typeProperties": {
                "method": "POST",
            },
        }

        result = self.transformer.transform_activity(activity)

        assert result["typeProperties"]["method"] == "POST"

    def test_add_policy_timeout(self):
        """Test policy timeout injection."""
        activity = {
            "name": "TestActivity",
            "type": "Wait",
            "typeProperties": {},
        }

        result = self.transformer.transform_activity(activity)

        assert "policy" in result
        assert result["policy"]["timeout"] == "0.12:00:00"

    def test_preserve_existing_policy(self):
        """Test existing policy is preserved."""
        activity = {
            "name": "TestActivity",
            "type": "Wait",
            "typeProperties": {},
            "policy": {
                "timeout": "1.00:00:00",
                "retry": 3,
            },
        }

        result = self.transformer.transform_activity(activity)

        assert result["policy"]["timeout"] == "1.00:00:00"
        assert result["policy"]["retry"] == 3


class TestActivityTransformerDatasetReferences:
    """Test dataset reference transformation."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()

    def test_transform_activity_inputs(self):
        """Test activity inputs transformation."""
        inputs = [
            {"type": "DatasetReference", "referenceName": "InputDataset"},
            {"type": "DatasetReference", "dataset": {"referenceName": "OtherDataset"}},
        ]

        result = self.transformer.transform_activity_inputs(inputs)

        assert len(result) == 2
        assert result[0]["type"] == "DatasetReference"
        assert result[0]["referenceName"] == "InputDataset"
        assert result[1]["type"] == "DatasetReference"
        assert result[1]["referenceName"] == "OtherDataset"

    def test_transform_activity_outputs(self):
        """Test activity outputs transformation."""
        outputs = [
            {"type": "DatasetReference", "referenceName": "OutputDataset"},
        ]

        result = self.transformer.transform_activity_outputs(outputs)

        assert len(result) == 1
        assert result[0]["type"] == "DatasetReference"
        assert result[0]["referenceName"] == "OutputDataset"

    def test_transform_non_list_inputs(self):
        """Test non-list inputs returns as-is."""
        result = self.transformer.transform_activity_inputs("not a list")
        assert result == "not a list"

    def test_transform_non_list_outputs(self):
        """Test non-list outputs returns as-is."""
        result = self.transformer.transform_activity_outputs("not a list")
        assert result == "not a list"


class TestActivityTransformerFailedConnectors:
    """Test failed connector handling."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()
        self.transformer.set_failed_connectors({"FailedLS", "AnotherFailedLS"})

    def test_get_failed_connectors(self):
        """Test getting failed connectors."""
        failed = self.transformer.get_failed_connectors()
        assert "FailedLS" in failed
        assert "AnotherFailedLS" in failed

    def test_activity_references_failed_connector_direct(self):
        """Test detection of failed connector in linked service reference."""
        activity = {
            "name": "TestActivity",
            "type": "Lookup",
            "typeProperties": {
                "linkedServiceName": {"referenceName": "FailedLS"},
            },
        }

        result = self.transformer.activity_references_failed_connector(activity)
        assert result is True

    def test_activity_references_failed_connector_in_dataset(self):
        """Test detection of failed connector in dataset reference."""
        activity = {
            "name": "TestActivity",
            "type": "Copy",
            "typeProperties": {
                "source": {
                    "dataset": {
                        "linkedServiceName": {"referenceName": "FailedLS"},
                    },
                },
            },
        }

        result = self.transformer.activity_references_failed_connector(activity)
        assert result is True

    def test_activity_no_failed_connector(self):
        """Test activity without failed connector references."""
        activity = {
            "name": "TestActivity",
            "type": "Lookup",
            "typeProperties": {
                "linkedServiceName": {"referenceName": "WorkingLS"},
            },
        }

        result = self.transformer.activity_references_failed_connector(activity)
        assert result is False

    def test_activity_references_failed_connector_empty_input(self):
        """Test with empty or None input."""
        assert self.transformer.activity_references_failed_connector(None) is False
        assert self.transformer.activity_references_failed_connector({}) is False


class TestActivityTransformerUtilities:
    """Test utility methods."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()

    def test_count_inactive_activities(self):
        """Test counting inactive activities."""
        activities = [
            {"name": "Active1", "type": "Wait", "state": "Active"},
            {"name": "Inactive1", "type": "Wait", "state": "Inactive"},
            {"name": "Active2", "type": "Wait"},
            {"name": "Inactive2", "type": "Wait", "state": "Inactive"},
        ]

        count = self.transformer.count_inactive_activities(activities)
        assert count == 2

    def test_count_inactive_activities_empty(self):
        """Test counting inactive activities in empty list."""
        assert self.transformer.count_inactive_activities([]) == 0

    def test_has_linked_service_references_with_inputs(self):
        """Test detection of linked service references via inputs."""
        activity = {
            "name": "CopyData",
            "type": "Copy",
            "inputs": [{"type": "DatasetReference", "referenceName": "InputDS"}],
            "outputs": [],
        }

        result = self.transformer.has_linked_service_references(activity)
        assert result is True

    def test_has_linked_service_references_with_outputs(self):
        """Test detection of linked service references via outputs."""
        activity = {
            "name": "CopyData",
            "type": "Copy",
            "inputs": [],
            "outputs": [{"type": "DatasetReference", "referenceName": "OutputDS"}],
        }

        result = self.transformer.has_linked_service_references(activity)
        assert result is True

    def test_has_linked_service_references_with_direct_ref(self):
        """Test detection of linked service references via direct reference."""
        activity = {
            "name": "Lookup",
            "type": "Lookup",
            "typeProperties": {
                "linkedServiceName": {"referenceName": "MyLS"},
            },
        }

        result = self.transformer.has_linked_service_references(activity)
        assert result is True

    def test_has_linked_service_references_with_source_ref(self):
        """Test detection of linked service references via source."""
        activity = {
            "name": "Lookup",
            "type": "Lookup",
            "typeProperties": {
                "source": {
                    "linkedServiceName": {"referenceName": "MyLS"},
                },
            },
        }

        result = self.transformer.has_linked_service_references(activity)
        assert result is True

    def test_has_linked_service_references_none(self):
        """Test detection when no linked service references exist."""
        activity = {
            "name": "Wait",
            "type": "Wait",
            "typeProperties": {"waitTimeInSeconds": 10},
        }

        result = self.transformer.has_linked_service_references(activity)
        assert result is False

    def test_has_linked_service_references_non_dict(self):
        """Test with non-dict input."""
        assert self.transformer.has_linked_service_references(None) is False
        assert self.transformer.has_linked_service_references("string") is False


class TestActivityTransformerConnectionMappings:
    """Test connection mapping functionality."""

    def setup_method(self):
        """Set up test fixtures."""
        self.transformer = ActivityTransformer()

    def test_set_and_get_connection_mappings(self):
        """Test setting and getting connection mappings."""
        mappings = {
            "BlobLS": "blob-connection-id",
            "SqlLS": "sql-connection-id",
        }

        self.transformer.set_connection_mappings(mappings)

        assert self.transformer.map_linked_service_to_connection("BlobLS") == "blob-connection-id"
        assert self.transformer.map_linked_service_to_connection("SqlLS") == "sql-connection-id"
        assert self.transformer.map_linked_service_to_connection("UnknownLS") is None

    def test_map_linked_service_to_connection_not_found(self):
        """Test mapping returns None when not found."""
        result = self.transformer.map_linked_service_to_connection("NonExistentLS")
        assert result is None
