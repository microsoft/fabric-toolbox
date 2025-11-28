"""
Connector Mapper for ADF to Fabric migration.

This module provides comprehensive mapping between Azure Data Factory (ADF)
LinkedService types and Microsoft Fabric connector types.
"""

from typing import Any, Dict, List, Optional, Tuple

from .models import ConnectorMapping, MappingConfidence


# Comprehensive mapping between ADF LinkedService types and Fabric Connector types
ADF_TO_FABRIC_TYPE_MAP: Dict[str, str] = {
    # SQL databases
    "SqlServer": "SqlServer",
    "AzureSqlDatabase": "SQL",
    "AzureSqlMI": "SQL",
    "AzureSqlDW": "SQL",
    "MySql": "MySQL",
    "AzureMySql": "MySQL",
    "PostgreSql": "PostgreSQL",
    "AzurePostgreSql": "PostgreSQL",
    "Oracle": "SQL",
    "Db2": "SQL",
    "Sybase": "SQL",
    "Teradata": "SQL",
    "Informix": "SQL",
    "Odbc": "ODBC",
    
    # Azure Storage
    "AzureBlobStorage": "AzureBlobs",
    "AzureDataLakeStore": "AzureDataLakeStorage",
    "AzureDataLakeStoreGen2": "AzureDataLakeStorage",
    "AzureFileStorage": "AzureFiles",
    "AzureTableStorage": "AzureTables",
    
    # Web and REST
    "RestService": "RestService",
    "WebTable": "Web",
    "HttpServer": "Web",
    "Http": "Web",
    "Web": "Web",
    "OData": "OData",
    
    # SharePoint and Office 365
    "SharePointOnlineList": "SharePointOnlineList",
    "Office365": "Office365Outlook",
    
    # Azure Services
    "AzureFunction": "AzureFunction",
    "AzureServiceBus": "AzureServiceBus",
    "AzureSearch": "AzureAISearch",
    "AzureDataExplorer": "AzureDataExplorer",
    "AzureKeyVault": "AzureKeyVault",
    "EventHub": "EventHub",
    
    # Cloud platforms
    "AmazonS3": "AmazonS3",
    "GoogleCloudStorage": "GoogleCloudStorage",
    "Snowflake": "Snowflake",
    "Databricks": "Databricks",
    
    # CRM and ERP
    "Dynamics": "DynamicsCrm",
    "DynamicsCrm": "DynamicsCrm",
    "DynamicsAX": "DynamicsAX",
    "Salesforce": "Salesforce",
    "CommonDataServiceForApps": "CommonDataServiceForApps",
    
    # Analytics and BI
    "GoogleAnalytics": "GoogleAnalytics",
    "AzureDataLakeAnalytics": "AzureDataLakeAnalytics",
    "AmazonRedshift": "AmazonRedshift",
    
    # Development and collaboration
    "GitHub": "GitHub",
    "Tfs": "VSTS",
    
    # Generic fallback
    "CustomDataSource": "Generic",
}


# Connection details field mapping for different connector types
CONNECTION_DETAILS_FIELD_MAPPING: Dict[str, Dict[str, List[str]]] = {
    # SQL-based connectors
    "SQL": {
        "server": ["server", "serverName"],
        "database": ["database", "databaseName"],
    },
    "SqlServer": {
        "server": ["server", "serverName"],
        "database": ["database", "databaseName"],
    },
    "MySQL": {
        "server": ["server", "serverName"],
        "database": ["database", "databaseName"],
    },
    "PostgreSQL": {
        "server": ["server", "serverName"],
        "database": ["database", "databaseName"],
    },
    
    # Web-based connectors
    "Web": {
        "url": ["url", "baseUrl", "serviceUri"],
    },
    "RestService": {
        "url": ["url", "baseUrl", "serviceUri"],
    },
    "OData": {
        "url": ["url", "baseUrl", "serviceUri"],
    },
    
    # Azure Storage connectors
    "AzureBlobs": {
        "account": ["accountName", "storageAccount"],
    },
    "AzureDataLakeStorage": {
        "account": ["accountName", "storageAccount"],
    },
    "AzureFiles": {
        "account": ["accountName", "storageAccount"],
    },
    
    # SharePoint and Office 365
    "SharePointOnlineList": {
        "sharePointSiteUrl": ["siteUrl", "url", "baseUrl"],
    },
    
    # Azure Data Explorer
    "AzureDataExplorer": {
        "cluster": ["endpoint", "clusterUri"],
        "database": ["database", "databaseName"],
    },
    
    # Databricks
    "Databricks": {
        "httpPath": ["httpPath", "path"],
    },
}


# Connectors that require gateway configuration
GATEWAY_REQUIRED_TYPES = [
    "OnPremisesSql",
    "OnPremisesOracle", 
    "OnPremisesFileSystem",
    "FileServer",
    "SelfHosted",
    "Hdfs",
]


# High confidence mappings (well-tested)
HIGH_CONFIDENCE_MAPPINGS = [
    "SqlServer",
    "AzureSqlDatabase",
    "AzureBlobStorage",
    "AzureDataLakeStore",
    "RestService",
    "Web",
    "OData",
    "AzureFunction",
    "AzureKeyVault",
]


# Types requiring special handling during migration
SPECIAL_HANDLING_TYPES = [
    "HttpServer",  # Maps to Web but needs URL transformation
    "CustomDataSource",  # Always generic
    "FileServer",  # May need gateway configuration
]


class ConnectorMapper:
    """
    Service for mapping ADF LinkedService types to Fabric connector types.
    
    This class provides comprehensive mapping between Azure Data Factory
    LinkedService types and Microsoft Fabric connector types, including
    field mapping and validation support.
    
    Example:
        >>> mapper = ConnectorMapper()
        >>> mapping = mapper.map_connector({"type": "AzureBlobStorage"})
        >>> print(mapping.fabric_type)
        'AzureBlobs'
    """
    
    def __init__(self):
        """Initialize the connector mapper."""
        self._adf_to_fabric_map = ADF_TO_FABRIC_TYPE_MAP.copy()
        self._field_mappings = CONNECTION_DETAILS_FIELD_MAPPING.copy()
    
    def map_adf_to_fabric_type(self, adf_type: str) -> str:
        """
        Map ADF LinkedService type to Fabric connector type.
        
        Args:
            adf_type: The ADF LinkedService type string.
            
        Returns:
            The corresponding Fabric connector type, or 'Generic' if no mapping found.
        """
        if not adf_type or not isinstance(adf_type, str):
            return "Generic"
        
        # Direct mapping lookup
        fabric_type = self._adf_to_fabric_map.get(adf_type)
        if fabric_type:
            return fabric_type
        
        # Try case-insensitive lookup
        adf_type_lower = adf_type.lower()
        for adf_key, fabric_val in self._adf_to_fabric_map.items():
            if adf_key.lower() == adf_type_lower:
                return fabric_val
        
        # Try partial matching for variations
        for adf_key, fabric_val in self._adf_to_fabric_map.items():
            if adf_type in adf_key or adf_key in adf_type:
                return fabric_val
        
        return "Generic"
    
    def is_connector_type_supported(self, adf_type: str) -> bool:
        """
        Check if an ADF connector type is supported in Fabric.
        
        Args:
            adf_type: The ADF LinkedService type.
            
        Returns:
            True if the connector type is supported, False otherwise.
        """
        fabric_type = self.map_adf_to_fabric_type(adf_type)
        return fabric_type != "Generic"
    
    def get_connection_details_mapping(self, fabric_type: str) -> Dict[str, List[str]]:
        """
        Get field mapping for a specific Fabric connector type.
        
        Args:
            fabric_type: The Fabric connector type.
            
        Returns:
            Dictionary mapping Fabric field names to possible ADF field names.
        """
        return self._field_mappings.get(fabric_type, {})
    
    def build_connection_details_from_adf(
        self, 
        fabric_type: str, 
        adf_linked_service: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Build Fabric connection details from ADF linked service properties.
        
        Args:
            fabric_type: The target Fabric connector type.
            adf_linked_service: The ADF linked service definition.
            
        Returns:
            Dictionary of connection details for Fabric.
        """
        connection_details: Dict[str, Any] = {}
        type_properties = (
            adf_linked_service.get("properties", {}).get("typeProperties", {})
            if isinstance(adf_linked_service.get("properties"), dict)
            else adf_linked_service.get("typeProperties", {})
        )
        
        # Get field mapping for this connector type
        field_mapping = self.get_connection_details_mapping(fabric_type)
        
        # Map fields from ADF to Fabric format
        for fabric_field, adf_fields in field_mapping.items():
            value = self._extract_field_value(type_properties, adf_fields)
            if value is not None:
                connection_details[fabric_field] = value
        
        # If no specific mapping found, try common properties
        if not connection_details:
            common_props = ["url", "server", "database", "connectionString", "account"]
            for prop in common_props:
                if type_properties.get(prop) is not None:
                    connection_details[prop] = type_properties[prop]
        
        return connection_details
    
    def _extract_field_value(
        self, 
        type_properties: Dict[str, Any], 
        field_mappings: List[str]
    ) -> Optional[Any]:
        """
        Extract field value from ADF type properties.
        
        Args:
            type_properties: The ADF typeProperties object.
            field_mappings: List of possible field names to try.
            
        Returns:
            The field value if found, None otherwise.
        """
        for mapped_field in field_mappings:
            if type_properties.get(mapped_field) is not None:
                return type_properties[mapped_field]
            
            # Try variations of the field name
            variations = [
                mapped_field.lower(),
                mapped_field.upper(),
                mapped_field[0].upper() + mapped_field[1:].lower() if mapped_field else "",
            ]
            
            for variation in variations:
                if type_properties.get(variation) is not None:
                    return type_properties[variation]
        
        return None
    
    def map_connector(self, adf_linked_service: Dict[str, Any]) -> ConnectorMapping:
        """
        Map a single ADF LinkedService to Fabric connector.
        
        Args:
            adf_linked_service: The ADF linked service definition.
            
        Returns:
            A ConnectorMapping object with mapping details.
            
        Raises:
            ValueError: If the linked service is missing required type field.
        """
        # Handle nested properties structure
        ls_type = adf_linked_service.get("type")
        if ls_type is None and "properties" in adf_linked_service:
            ls_type = adf_linked_service.get("properties", {}).get("type")
        
        if not ls_type:
            raise ValueError("Invalid ADF LinkedService: missing type")
        
        fabric_type = self.map_adf_to_fabric_type(ls_type)
        is_supported = fabric_type != "Generic"
        
        # Get field mappings
        field_mapping = self.get_connection_details_mapping(fabric_type)
        required_fields = list(field_mapping.keys())
        
        # Determine mapping confidence
        if fabric_type == "Generic":
            mapping_confidence = MappingConfidence.LOW
        elif not is_supported:
            mapping_confidence = MappingConfidence.MEDIUM
        elif ls_type in HIGH_CONFIDENCE_MAPPINGS:
            mapping_confidence = MappingConfidence.HIGH
        else:
            mapping_confidence = MappingConfidence.MEDIUM
        
        return ConnectorMapping(
            adf_type=ls_type,
            fabric_type=fabric_type,
            is_supported=is_supported,
            mapping_confidence=mapping_confidence,
            required_fields=required_fields,
            optional_fields=[],
        )
    
    def map_connectors(
        self, 
        adf_linked_services: List[Dict[str, Any]]
    ) -> List[ConnectorMapping]:
        """
        Map multiple ADF LinkedServices to Fabric connectors.
        
        Args:
            adf_linked_services: List of ADF linked service definitions.
            
        Returns:
            List of ConnectorMapping objects.
        """
        return [self.map_connector(ls) for ls in adf_linked_services]
    
    def validate_connector_mapping(self, adf_type: str) -> Dict[str, Any]:
        """
        Validate if an ADF type can be mapped to Fabric.
        
        Args:
            adf_type: The ADF LinkedService type to validate.
            
        Returns:
            Dictionary with validation results.
        """
        try:
            mock_linked_service = {"type": adf_type}
            mapping = self.map_connector(mock_linked_service)
            
            return {
                "can_map": mapping.is_supported,
                "fabric_type": mapping.fabric_type,
                "is_supported": mapping.is_supported,
                "confidence": mapping.mapping_confidence.value,
                "reason": (
                    None if mapping.is_supported
                    else f"Type {adf_type} maps to {mapping.fabric_type} but is not supported in Fabric"
                ),
            }
        except Exception as e:
            return {
                "can_map": False,
                "fabric_type": "Unknown",
                "is_supported": False,
                "confidence": "low",
                "reason": str(e),
            }
    
    def requires_gateway(self, adf_type: str) -> bool:
        """
        Check if a connector type requires gateway configuration.
        
        Args:
            adf_type: The ADF LinkedService type.
            
        Returns:
            True if gateway is required, False otherwise.
        """
        return any(keyword in adf_type for keyword in GATEWAY_REQUIRED_TYPES)
    
    def requires_special_handling(self, adf_type: str) -> bool:
        """
        Check if a connector type requires special handling.
        
        Args:
            adf_type: The ADF LinkedService type.
            
        Returns:
            True if special handling is required, False otherwise.
        """
        return adf_type in SPECIAL_HANDLING_TYPES
    
    def get_mapping_statistics(
        self, 
        adf_types: List[str]
    ) -> Dict[str, int]:
        """
        Get statistics for connector mappings.
        
        Args:
            adf_types: List of ADF LinkedService types.
            
        Returns:
            Dictionary with mapping statistics.
        """
        stats = {
            "total": len(adf_types),
            "high_confidence": 0,
            "medium_confidence": 0,
            "low_confidence": 0,
            "supported": 0,
            "unsupported": 0,
        }
        
        for adf_type in adf_types:
            validation = self.validate_connector_mapping(adf_type)
            
            confidence = validation.get("confidence", "low")
            if confidence == "high":
                stats["high_confidence"] += 1
            elif confidence == "medium":
                stats["medium_confidence"] += 1
            else:
                stats["low_confidence"] += 1
            
            if validation.get("is_supported", False):
                stats["supported"] += 1
            else:
                stats["unsupported"] += 1
        
        return stats
    
    def get_high_confidence_mappings(self) -> List[str]:
        """
        Get list of ADF types that have high-confidence mappings.
        
        Returns:
            List of ADF type strings with high confidence mappings.
        """
        return HIGH_CONFIDENCE_MAPPINGS.copy()
    
    def get_all_mappings(self) -> Dict[str, str]:
        """
        Get all ADF to Fabric type mappings.
        
        Returns:
            Dictionary of all mappings.
        """
        return self._adf_to_fabric_map.copy()


# Singleton instance for convenience
connector_mapper = ConnectorMapper()
