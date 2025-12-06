"""
ADF Fabric Migrator - Python Library for Azure Data Factory to Microsoft Fabric Migration

This library provides core logic for parsing and transforming Azure Data Factory (ADF)
ARM templates to Microsoft Fabric format without any frontend dependencies.

Main components:
- ADFParser: Parse ADF ARM templates and extract components
- PipelineTransformer: Transform ADF pipelines to Fabric Data Pipeline format
- ConnectorMapper: Map ADF LinkedService types to Fabric connector types
- GlobalParameterDetector: Detect and migrate global parameters to Variable Libraries
"""

from .models import (
    ADFComponent,
    ComponentType,
    CompatibilityStatus,
    FabricTarget,
    FabricTargetType,
    GlobalParameterReference,
    VariableLibraryConfig,
    ADFFolderInfo,
    TriggerMetadata,
    ValidationRule,
    ComponentSummary,
    ConnectorMapping,
    MappingConfidence,
)

from .parser import ADFParser
from .transformer import PipelineTransformer
from .connector_mapper import ConnectorMapper
from .global_parameter_detector import GlobalParameterDetector
from .global_parameter_transformer import GlobalParameterExpressionTransformer
from .custom_activity_resolver import CustomActivityResolver
from .activity_transformer import ActivityTransformer

__version__ = "0.1.0"
__all__ = [
    # Main classes
    "ADFParser",
    "PipelineTransformer", 
    "ConnectorMapper",
    "GlobalParameterDetector",
    "GlobalParameterExpressionTransformer",
    "CustomActivityResolver",
    "ActivityTransformer",
    # Models
    "ADFComponent",
    "ComponentType",
    "CompatibilityStatus",
    "FabricTarget",
    "FabricTargetType",
    "GlobalParameterReference",
    "VariableLibraryConfig",
    "ADFFolderInfo",
    "TriggerMetadata",
    "ValidationRule",
    "ComponentSummary",
    "ConnectorMapping",
    "MappingConfidence",
]
