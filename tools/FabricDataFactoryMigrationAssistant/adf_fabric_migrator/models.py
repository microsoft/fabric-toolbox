"""
Data models for ADF to Fabric migration.

These models are Python dataclass equivalents of the TypeScript interfaces
defined in the original TypeScript codebase.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union


class ComponentType(str, Enum):
    """ADF component types."""
    PIPELINE = "pipeline"
    DATASET = "dataset"
    LINKED_SERVICE = "linkedService"
    TRIGGER = "trigger"
    GLOBAL_PARAMETER = "globalParameter"
    INTEGRATION_RUNTIME = "integrationRuntime"
    MAPPING_DATA_FLOW = "mappingDataFlow"
    CUSTOM_ACTIVITY = "customActivity"
    MANAGED_IDENTITY = "managedIdentity"


class CompatibilityStatus(str, Enum):
    """Component compatibility status with Fabric."""
    SUPPORTED = "supported"
    PARTIALLY_SUPPORTED = "partiallySupported"
    UNSUPPORTED = "unsupported"


class FabricTargetType(str, Enum):
    """Fabric target types for migration."""
    DATA_PIPELINE = "dataPipeline"
    CONNECTOR = "connector"
    VARIABLE = "variable"
    SCHEDULE = "schedule"
    NOTEBOOK = "notebook"
    GATEWAY = "gateway"
    WORKSPACE_IDENTITY = "workspaceIdentity"


class MappingConfidence(str, Enum):
    """Confidence level for connector mapping."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class GatewayType(str, Enum):
    """Gateway type for connections."""
    VIRTUAL_NETWORK = "VirtualNetwork"
    ON_PREMISES = "OnPremises"


class PrivacyLevel(str, Enum):
    """Privacy level for connections."""
    PUBLIC = "Public"
    ORGANIZATIONAL = "Organizational"
    PRIVATE = "Private"


class ADFDataType(str, Enum):
    """ADF global parameter data types."""
    STRING = "String"
    INT = "Int"
    FLOAT = "Float"
    BOOL = "Bool"
    ARRAY = "Array"
    OBJECT = "Object"
    SECURE_STRING = "SecureString"


class FabricDataType(str, Enum):
    """Fabric Variable Library data types."""
    STRING = "String"
    INTEGER = "Integer"
    NUMBER = "Number"
    BOOLEAN = "Boolean"


@dataclass
class ADFFolderInfo:
    """Folder information from ADF ARM template."""
    path: str
    name: str
    depth: int
    segments: List[str]
    original_path: str
    parent_path: Optional[str] = None
    is_flattened: bool = False
    flattening_applied: Optional[Dict[str, Any]] = None


@dataclass
class TriggerRecurrence:
    """Trigger recurrence configuration."""
    frequency: str
    interval: int
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    time_zone: str = "UTC"


@dataclass
class TriggerMetadata:
    """Trigger-specific metadata."""
    runtime_state: str  # 'Started' | 'Stopped' | 'Unknown'
    type: str
    recurrence: Optional[TriggerRecurrence] = None
    referenced_pipelines: List[str] = field(default_factory=list)
    pipeline_parameters: Optional[List[Dict[str, Any]]] = None


@dataclass
class FabricTarget:
    """Fabric migration target configuration."""
    type: FabricTargetType
    name: str
    configuration: Optional[Dict[str, Any]] = None
    schedule_config: Optional[Dict[str, Any]] = None
    gateway_type: Optional[GatewayType] = None
    connect_via: Optional[str] = None
    connector_type: Optional[str] = None
    connection_details: Optional[Dict[str, Any]] = None
    credential_type: Optional[str] = None
    privacy_level: Optional[PrivacyLevel] = None


@dataclass
class ResourceDependencies:
    """Parsed resource-level dependencies categorized by type."""
    linked_services: List[str] = field(default_factory=list)
    pipelines: List[str] = field(default_factory=list)
    datasets: List[str] = field(default_factory=list)
    triggers: List[str] = field(default_factory=list)
    dataflows: List[str] = field(default_factory=list)
    other: List[str] = field(default_factory=list)


@dataclass
class GlobalParameterReference:
    """Represents a detected global parameter reference from ADF pipelines."""
    name: str
    adf_data_type: str  # ADFDataType value
    fabric_data_type: str  # FabricDataType value
    default_value: Union[str, int, float, bool]
    referenced_by_pipelines: List[str] = field(default_factory=list)
    is_secure: bool = False
    note: Optional[str] = None


@dataclass
class ADFComponent:
    """An ADF component extracted from ARM template."""
    name: str
    type: ComponentType
    definition: Dict[str, Any]
    is_selected: bool = True
    compatibility_status: CompatibilityStatus = CompatibilityStatus.SUPPORTED
    warnings: List[str] = field(default_factory=list)
    fabric_target: Optional[FabricTarget] = None
    folder: Optional[ADFFolderInfo] = None
    depends_on: List[str] = field(default_factory=list)
    resource_dependencies: Optional[ResourceDependencies] = None
    trigger_metadata: Optional[TriggerMetadata] = None
    global_parameter_references: Optional[List[GlobalParameterReference]] = None


@dataclass
class ValidationRule:
    """Component validation rule."""
    component_type: str
    is_supported: bool
    warnings: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)


@dataclass
class ComponentSummary:
    """Summary of parsed components."""
    total: int
    supported: int
    partially_supported: int
    unsupported: int
    by_type: Dict[str, int] = field(default_factory=dict)
    parameterized_linked_services_count: int = 0
    parameterized_linked_services_pipeline_count: int = 0
    parameterized_linked_services_names: List[str] = field(default_factory=list)


@dataclass
class ConnectorMapping:
    """Mapping between ADF and Fabric connector types."""
    adf_type: str
    fabric_type: str
    is_supported: bool
    mapping_confidence: MappingConfidence
    required_fields: List[str] = field(default_factory=list)
    optional_fields: List[str] = field(default_factory=list)


@dataclass
class VariableLibraryConfig:
    """Configuration for the Fabric Variable Library to be created."""
    display_name: str
    workspace_id: str
    variables: List[GlobalParameterReference] = field(default_factory=list)
    description: Optional[str] = None
    folder_id: Optional[str] = None
    deployment_status: Optional[str] = None  # 'pending' | 'deploying' | 'success' | 'failed'
    fabric_item_id: Optional[str] = None
    deployment_error: Optional[str] = None


@dataclass
class ActivitySummary:
    """Summary of a pipeline activity."""
    name: str
    type: str
    description: Optional[str] = None
    is_custom_activity: bool = False
    custom_activity_references: Optional[Dict[str, Any]] = None


@dataclass
class PipelineArtifact:
    """Pipeline artifact information for profiling."""
    name: str
    activity_count: int
    activities: List[ActivitySummary] = field(default_factory=list)
    parameter_count: int = 0
    triggered_by: List[str] = field(default_factory=list)
    uses_datasets: List[str] = field(default_factory=list)
    executes_pipelines: List[str] = field(default_factory=list)
    uses_linked_services: List[str] = field(default_factory=list)
    depends_on_pipelines: List[str] = field(default_factory=list)
    depends_on_linked_services: List[str] = field(default_factory=list)
    depends_on_dataflows: List[str] = field(default_factory=list)
    folder: Optional[str] = None
    fabric_mapping: Optional[Dict[str, Any]] = None


@dataclass
class DatasetArtifact:
    """Dataset artifact information for profiling."""
    name: str
    type: str
    linked_service: str
    used_by_pipelines: List[str] = field(default_factory=list)
    usage_count: int = 0
    fabric_mapping: Optional[Dict[str, Any]] = None


@dataclass
class LinkedServiceArtifact:
    """Linked service artifact information for profiling."""
    name: str
    type: str
    used_by_datasets: List[str] = field(default_factory=list)
    used_by_pipelines: List[str] = field(default_factory=list)
    usage_score: int = 0
    fabric_mapping: Optional[Dict[str, Any]] = None


@dataclass
class TriggerArtifact:
    """Trigger artifact information for profiling."""
    name: str
    type: str
    status: str
    pipelines: List[str] = field(default_factory=list)
    depends_on_pipelines: List[str] = field(default_factory=list)
    schedule: Optional[str] = None
    recurrence: Optional[Dict[str, Any]] = None
    fabric_mapping: Optional[Dict[str, Any]] = None


@dataclass
class ProfileMetrics:
    """Comprehensive metrics from ARM template analysis."""
    total_pipelines: int
    total_datasets: int
    total_linked_services: int
    total_triggers: int
    total_dataflows: int
    total_integration_runtimes: int
    total_global_parameters: int
    total_activities: int
    activities_by_type: Dict[str, int] = field(default_factory=dict)
    avg_activities_per_pipeline: float = 0.0
    max_activities_per_pipeline: int = 0
    max_activities_pipeline_name: str = ""
    custom_activities_count: int = 0
    total_custom_activity_references: int = 0
    custom_activities_with_multiple_references: int = 0
    pipeline_dependencies: int = 0
    trigger_pipeline_mappings: int = 0
    parameterized_linked_services_count: int = 0
    total_parameterized_linked_service_parameters: int = 0


@dataclass
class ProfileInsight:
    """Insight generated from profile analysis."""
    id: str
    icon: str
    title: str
    description: str
    severity: str  # 'info' | 'warning' | 'critical'
    metric: Optional[int] = None
    recommendation: Optional[str] = None


@dataclass 
class GraphNode:
    """Node in dependency graph."""
    id: str
    type: str
    label: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    fabric_target: str = ""
    criticality: str = "low"  # 'high' | 'medium' | 'low'


@dataclass
class GraphEdge:
    """Edge in dependency graph."""
    source: str
    target: str
    type: str
    label: str


@dataclass
class DependencyGraph:
    """Complete dependency graph."""
    nodes: List[GraphNode] = field(default_factory=list)
    edges: List[GraphEdge] = field(default_factory=list)


@dataclass
class ArtifactBreakdown:
    """Detailed artifact breakdown."""
    pipelines: List[PipelineArtifact] = field(default_factory=list)
    datasets: List[DatasetArtifact] = field(default_factory=list)
    linked_services: List[LinkedServiceArtifact] = field(default_factory=list)
    triggers: List[TriggerArtifact] = field(default_factory=list)
    dataflows: List[Dict[str, Any]] = field(default_factory=list)
    parameterized_linked_services: List[Dict[str, Any]] = field(default_factory=list)
    global_parameters: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class ADFProfile:
    """Complete ADF profile from ARM template."""
    metadata: Dict[str, Any]
    metrics: ProfileMetrics
    artifacts: ArtifactBreakdown
    dependencies: DependencyGraph
    insights: List[ProfileInsight] = field(default_factory=list)
