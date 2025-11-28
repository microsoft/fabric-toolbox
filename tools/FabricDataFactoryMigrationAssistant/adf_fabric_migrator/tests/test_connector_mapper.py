"""Tests for the ConnectorMapper class."""

import pytest

from adf_fabric_migrator.connector_mapper import ConnectorMapper
from adf_fabric_migrator.models import MappingConfidence


class TestConnectorMapper:
    """Test suite for ConnectorMapper."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.mapper = ConnectorMapper()
    
    def test_map_adf_to_fabric_type_direct_mapping(self):
        """Test direct type mapping."""
        assert self.mapper.map_adf_to_fabric_type("AzureBlobStorage") == "AzureBlobs"
        assert self.mapper.map_adf_to_fabric_type("AzureSqlDatabase") == "SQL"
        assert self.mapper.map_adf_to_fabric_type("SqlServer") == "SqlServer"
        assert self.mapper.map_adf_to_fabric_type("RestService") == "RestService"
    
    def test_map_adf_to_fabric_type_case_insensitive(self):
        """Test case-insensitive mapping."""
        assert self.mapper.map_adf_to_fabric_type("azureblobstorage") == "AzureBlobs"
        assert self.mapper.map_adf_to_fabric_type("AZURESQLDATABASE") == "SQL"
    
    def test_map_adf_to_fabric_type_unknown(self):
        """Test unknown type returns Generic."""
        assert self.mapper.map_adf_to_fabric_type("UnknownConnector") == "Generic"
        assert self.mapper.map_adf_to_fabric_type("") == "Generic"
        assert self.mapper.map_adf_to_fabric_type(None) == "Generic"
    
    def test_is_connector_type_supported(self):
        """Test connector support checking."""
        assert self.mapper.is_connector_type_supported("AzureBlobStorage") is True
        assert self.mapper.is_connector_type_supported("AzureSqlDatabase") is True
        assert self.mapper.is_connector_type_supported("CustomDataSource") is False
        assert self.mapper.is_connector_type_supported("UnknownType") is False
    
    def test_map_connector(self):
        """Test mapping a single connector."""
        mapping = self.mapper.map_connector({"type": "AzureBlobStorage"})
        
        assert mapping.adf_type == "AzureBlobStorage"
        assert mapping.fabric_type == "AzureBlobs"
        assert mapping.is_supported is True
        assert mapping.mapping_confidence in (MappingConfidence.HIGH, MappingConfidence.MEDIUM)
    
    def test_map_connector_with_properties(self):
        """Test mapping connector with nested properties."""
        mapping = self.mapper.map_connector({
            "properties": {
                "type": "AzureSqlDatabase",
                "typeProperties": {
                    "server": "myserver.database.windows.net",
                    "database": "mydb"
                }
            }
        })
        
        assert mapping.adf_type == "AzureSqlDatabase"
        assert mapping.fabric_type == "SQL"
        assert mapping.is_supported is True
    
    def test_map_connector_missing_type(self):
        """Test mapping connector with missing type raises error."""
        with pytest.raises(ValueError, match="missing type"):
            self.mapper.map_connector({})
    
    def test_map_connectors_batch(self):
        """Test mapping multiple connectors."""
        linked_services = [
            {"type": "AzureBlobStorage"},
            {"type": "AzureSqlDatabase"},
            {"type": "RestService"},
        ]
        
        mappings = self.mapper.map_connectors(linked_services)
        
        assert len(mappings) == 3
        assert mappings[0].fabric_type == "AzureBlobs"
        assert mappings[1].fabric_type == "SQL"
        assert mappings[2].fabric_type == "RestService"
    
    def test_validate_connector_mapping(self):
        """Test connector mapping validation."""
        validation = self.mapper.validate_connector_mapping("AzureBlobStorage")
        
        assert validation["can_map"] is True
        assert validation["fabric_type"] == "AzureBlobs"
        assert validation["is_supported"] is True
        assert validation["reason"] is None
    
    def test_validate_connector_mapping_unsupported(self):
        """Test validation of unsupported connector."""
        validation = self.mapper.validate_connector_mapping("CustomDataSource")
        
        assert validation["can_map"] is False
        assert validation["fabric_type"] == "Generic"
        assert validation["is_supported"] is False
        assert validation["reason"] is not None
    
    def test_build_connection_details_from_adf(self):
        """Test building connection details from ADF linked service."""
        linked_service = {
            "properties": {
                "typeProperties": {
                    "server": "myserver.database.windows.net",
                    "database": "mydb"
                }
            }
        }
        
        details = self.mapper.build_connection_details_from_adf("SQL", linked_service)
        
        assert details.get("server") == "myserver.database.windows.net"
        assert details.get("database") == "mydb"
    
    def test_build_connection_details_web_connector(self):
        """Test building connection details for web connector."""
        linked_service = {
            "properties": {
                "typeProperties": {
                    "url": "https://api.example.com"
                }
            }
        }
        
        details = self.mapper.build_connection_details_from_adf("Web", linked_service)
        
        assert details.get("url") == "https://api.example.com"
    
    def test_requires_gateway(self):
        """Test gateway requirement detection."""
        assert self.mapper.requires_gateway("FileServer") is True
        assert self.mapper.requires_gateway("OnPremisesSql") is True
        assert self.mapper.requires_gateway("AzureBlobStorage") is False
        assert self.mapper.requires_gateway("RestService") is False
    
    def test_requires_special_handling(self):
        """Test special handling detection."""
        assert self.mapper.requires_special_handling("HttpServer") is True
        assert self.mapper.requires_special_handling("CustomDataSource") is True
        assert self.mapper.requires_special_handling("AzureBlobStorage") is False
    
    def test_get_mapping_statistics(self):
        """Test getting mapping statistics."""
        adf_types = ["AzureBlobStorage", "SqlServer", "CustomDataSource", "UnknownType"]
        
        stats = self.mapper.get_mapping_statistics(adf_types)
        
        assert stats["total"] == 4
        assert stats["supported"] == 2
        assert stats["unsupported"] == 2
    
    def test_get_high_confidence_mappings(self):
        """Test getting high confidence mappings."""
        mappings = self.mapper.get_high_confidence_mappings()
        
        assert "SqlServer" in mappings
        assert "AzureBlobStorage" in mappings
        assert "RestService" in mappings
    
    def test_get_all_mappings(self):
        """Test getting all mappings."""
        all_mappings = self.mapper.get_all_mappings()
        
        assert len(all_mappings) > 0
        assert "AzureBlobStorage" in all_mappings
        assert all_mappings["AzureBlobStorage"] == "AzureBlobs"
