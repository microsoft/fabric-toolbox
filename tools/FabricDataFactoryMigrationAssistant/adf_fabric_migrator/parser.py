"""
ADF Parser for parsing Azure Data Factory ARM templates.

This module provides comprehensive parsing of ADF and Synapse ARM templates,
extracting all components including pipelines, datasets, linked services,
triggers, global parameters, and integration runtimes.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from .models import (
    ADFComponent,
    ADFFolderInfo,
    ADFProfile,
    ArtifactBreakdown,
    ComponentSummary,
    ComponentType,
    CompatibilityStatus,
    DatasetArtifact,
    DependencyGraph,
    FabricTarget,
    FabricTargetType,
    GatewayType,
    GlobalParameterReference,
    GraphEdge,
    GraphNode,
    LinkedServiceArtifact,
    PipelineArtifact,
    ProfileInsight,
    ProfileMetrics,
    ResourceDependencies,
    TriggerArtifact,
    TriggerMetadata,
    TriggerRecurrence,
    ValidationRule,
    ActivitySummary,
)
from .global_parameter_detector import GlobalParameterDetector

logger = logging.getLogger(__name__)


# Component validation rules
VALIDATION_RULES: List[ValidationRule] = [
    ValidationRule(
        component_type="pipeline",
        is_supported=True,
        warnings=[],
    ),
    ValidationRule(
        component_type="dataset",
        is_supported=True,
        warnings=["Datasets will be embedded within pipeline activities in Fabric"],
    ),
    ValidationRule(
        component_type="linkedService",
        is_supported=True,
        warnings=[],
    ),
    ValidationRule(
        component_type="trigger",
        is_supported=True,
        warnings=["Schedule triggers supported, other trigger types may need manual configuration"],
    ),
    ValidationRule(
        component_type="globalParameter",
        is_supported=True,
        warnings=["Will be migrated to Fabric Variable Library"],
    ),
    ValidationRule(
        component_type="integrationRuntime",
        is_supported=True,
        warnings=["Integration Runtimes will be migrated to Fabric Gateways"],
        suggestions=["Managed IR -> Virtual Network Gateway", "Self-hosted IR -> On-Premises Gateway"],
    ),
    ValidationRule(
        component_type="mappingDataFlow",
        is_supported=False,
        warnings=["Mapping Data Flows not supported in Fabric Data Factory"],
        suggestions=["Consider using Fabric Dataflow Gen2 for similar functionality"],
    ),
    ValidationRule(
        component_type="customActivity",
        is_supported=True,
        warnings=["May require Fabric Notebook or external compute configuration"],
    ),
    ValidationRule(
        component_type="managedIdentity",
        is_supported=True,
        warnings=["Managed Identity credentials will be migrated to Fabric Workspace Identity"],
        suggestions=["Workspace Identity provides similar functionality for authentication"],
    ),
]


class ADFParser:
    """
    Parser for Azure Data Factory ARM templates.
    
    This class provides comprehensive parsing of ADF and Synapse ARM templates,
    extracting all components and generating detailed profiles for migration.
    
    Example:
        >>> parser = ADFParser()
        >>> with open("arm_template.json", "r") as f:
        ...     content = f.read()
        >>> components = parser.parse_arm_template(content)
        >>> print(f"Found {len(components)} components")
    """
    
    def __init__(self):
        """Initialize the ADF parser."""
        self._parsed_components: List[ADFComponent] = []
        self._dataset_mappings: Dict[str, Dict[str, Any]] = {}
        self._linked_service_mappings: Dict[str, Dict[str, Any]] = {}
        self._global_parameter_detector = GlobalParameterDetector()
        self._validation_rules = {rule.component_type: rule for rule in VALIDATION_RULES}
    
    def parse_arm_template(self, file_content: str) -> List[ADFComponent]:
        """
        Parse an ADF/Synapse ARM template and extract all components.
        
        Args:
            file_content: The JSON content of the ARM template.
            
        Returns:
            List of ADFComponent objects.
            
        Raises:
            ValueError: If the JSON is invalid or not a valid ARM template.
        """
        try:
            arm_template = json.loads(file_content)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON format: {e}")
        
        if not self._is_valid_arm_template(arm_template):
            raise ValueError("Invalid ARM template: missing or invalid resources array")
        
        components: List[ADFComponent] = []
        
        # Extract components from ARM template resources
        for resource in arm_template.get("resources", []):
            if not self._is_valid_arm_resource(resource):
                continue
            
            resource_type = resource.get("type", "")
            
            if resource_type == "Microsoft.DataFactory/factories":
                # Process nested resources within the data factory
                nested_resources = resource.get("resources", [])
                if isinstance(nested_resources, list):
                    for nested_resource in nested_resources:
                        if self._is_valid_arm_resource(nested_resource):
                            component = self._parse_data_factory_resource(nested_resource)
                            if component:
                                components.append(component)
            elif resource_type.startswith("Microsoft.DataFactory/factories/"):
                # Process standalone data factory resources
                component = self._parse_data_factory_resource(resource)
                if component:
                    components.append(component)
            elif resource_type.startswith("Microsoft.Synapse/workspaces/"):
                # Process Synapse workspace resources
                component = self._parse_synapse_resource(resource)
                if component:
                    components.append(component)
        
        # Apply validation rules to each component
        validated_components = [self._validate_component(comp) for comp in components]
        
        # Detect global parameters
        logger.info("Detecting global parameters...")
        global_parameter_refs = self._global_parameter_detector.detect_with_fallback(
            validated_components, arm_template
        )
        
        if global_parameter_refs:
            logger.info(f"Detected {len(global_parameter_refs)} global parameters")
            # Store in pipeline components
            for component in validated_components:
                if component.type == ComponentType.PIPELINE:
                    component.global_parameter_references = global_parameter_refs
        
        # Store parsed components
        self._parsed_components = validated_components
        
        return validated_components
    
    def parse_arm_template_file(self, file_path: str) -> List[ADFComponent]:
        """
        Parse an ARM template from a file path.
        
        Args:
            file_path: Path to the ARM template JSON file.
            
        Returns:
            List of ADFComponent objects.
        """
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return self.parse_arm_template(content)
    
    def _is_valid_arm_template(self, obj: Any) -> bool:
        """Check if an object is a valid ARM template."""
        return (
            isinstance(obj, dict) 
            and isinstance(obj.get("resources"), list)
        )
    
    def _is_valid_arm_resource(self, obj: Any) -> bool:
        """Check if an object is a valid ARM resource."""
        return (
            isinstance(obj, dict)
            and isinstance(obj.get("type"), str)
            and isinstance(obj.get("name"), str)
        )
    
    def _extract_component_name(self, resource_name: str) -> str:
        """
        Extract component name from ARM template resource name.
        
        Handles expressions like:
        - "[concat(parameters('factoryName'), '/pipelineName')]"
        - "factoryName/pipelineName"
        - "pipelineName"
        """
        if not resource_name:
            return ""
        
        # Handle ARM template expressions
        if resource_name.startswith("[") and resource_name.endswith("]"):
            inner = resource_name[1:-1]
            
            # Look for concat expressions with factoryName/workspaceName
            patterns = [
                r"concat\s*\(\s*parameters\s*\(\s*['\"]factoryName['\"]\s*\)\s*,\s*['\"]([^'\"]+)['\"]\s*\)",
                r"concat\s*\(\s*parameters\s*\(\s*['\"]workspaceName['\"]\s*\)\s*,\s*['\"]([^'\"]+)['\"]\s*\)",
            ]
            
            for pattern in patterns:
                match = re.search(pattern, inner, re.IGNORECASE)
                if match:
                    return match.group(1).lstrip("/")
            
            # Try to extract any quoted string
            quoted_match = re.findall(r"['\"]([^'\"]+)['\"]", inner)
            for content in quoted_match:
                if content not in ("factoryName", "workspaceName", "/"):
                    return content.lstrip("/")
        
        # Handle direct names with slashes
        if "/" in resource_name:
            return resource_name.split("/")[-1]
        
        return resource_name
    
    def _get_component_type(self, resource_type: str) -> Optional[ComponentType]:
        """Map ARM resource type to component type."""
        type_suffix = resource_type.split("/")[-1] if resource_type else ""
        
        type_map = {
            "pipelines": ComponentType.PIPELINE,
            "datasets": ComponentType.DATASET,
            "linkedServices": ComponentType.LINKED_SERVICE,
            "triggers": ComponentType.TRIGGER,
            "globalParameters": ComponentType.GLOBAL_PARAMETER,
            "integrationRuntimes": ComponentType.INTEGRATION_RUNTIME,
            "dataflows": ComponentType.MAPPING_DATA_FLOW,
        }
        
        return type_map.get(type_suffix)
    
    def _parse_data_factory_resource(self, resource: Dict[str, Any]) -> Optional[ADFComponent]:
        """Parse a Data Factory resource into an ADFComponent."""
        resource_type = resource.get("type", "")
        resource_name = resource.get("name", "")
        
        type_suffix = resource_type.split("/")[-1] if "/" in resource_type else ""
        
        component_type: Optional[ComponentType] = None
        
        # Map resource types
        type_map = {
            "pipelines": ComponentType.PIPELINE,
            "datasets": ComponentType.DATASET,
            "linkedServices": ComponentType.LINKED_SERVICE,
            "triggers": ComponentType.TRIGGER,
            "globalParameters": ComponentType.GLOBAL_PARAMETER,
            "integrationRuntimes": ComponentType.INTEGRATION_RUNTIME,
            "dataflows": ComponentType.MAPPING_DATA_FLOW,
        }
        
        component_type = type_map.get(type_suffix)
        
        # Handle credentials/managed identity
        if type_suffix == "credentials":
            properties = resource.get("properties", {})
            if properties.get("type") == "ManagedIdentity":
                component_type = ComponentType.MANAGED_IDENTITY
            else:
                component_type = ComponentType.GLOBAL_PARAMETER
        
        # Handle custom activities
        if component_type is None:
            properties = resource.get("properties", {})
            if properties.get("type") == "Custom":
                component_type = ComponentType.CUSTOM_ACTIVITY
        
        if component_type is None:
            return None
        
        # Extract component name
        name = self._extract_component_name(resource_name)
        
        # Build definition
        definition = self._build_definition(resource, component_type)
        
        # Parse dependencies
        raw_depends_on = resource.get("dependsOn", [])
        resource_dependencies = self._parse_resource_dependencies(raw_depends_on)
        
        # Create component
        component = ADFComponent(
            name=name,
            type=component_type,
            definition=definition,
            is_selected=True,
            compatibility_status=CompatibilityStatus.SUPPORTED,
            warnings=[],
            fabric_target=self._generate_default_fabric_target(component_type, name, definition),
            depends_on=raw_depends_on,
            resource_dependencies=resource_dependencies,
        )
        
        # Extract folder info for pipelines
        if component_type == ComponentType.PIPELINE:
            component.folder = self._extract_folder_from_pipeline(component)
        
        # Extract trigger metadata
        if component_type == ComponentType.TRIGGER:
            component.trigger_metadata = self._extract_trigger_metadata(resource)
        
        # Cache datasets and linked services for quick lookup
        if component_type == ComponentType.DATASET:
            self._dataset_mappings[name] = definition
        elif component_type == ComponentType.LINKED_SERVICE:
            self._linked_service_mappings[name] = definition
        
        return component
    
    def _parse_synapse_resource(self, resource: Dict[str, Any]) -> Optional[ADFComponent]:
        """Parse a Synapse workspace resource into an ADFComponent."""
        # Similar logic to _parse_data_factory_resource but for Synapse
        resource_type = resource.get("type", "")
        parts = resource_type.split("/")
        
        if len(parts) < 3:
            return None
        
        type_suffix = parts[2]
        
        type_map = {
            "pipelines": ComponentType.PIPELINE,
            "datasets": ComponentType.DATASET,
            "linkedServices": ComponentType.LINKED_SERVICE,
            "triggers": ComponentType.TRIGGER,
            "integrationRuntimes": ComponentType.INTEGRATION_RUNTIME,
            "dataflows": ComponentType.MAPPING_DATA_FLOW,
        }
        
        component_type = type_map.get(type_suffix)
        
        if type_suffix == "credentials":
            properties = resource.get("properties", {})
            if properties.get("type") == "ManagedIdentity":
                component_type = ComponentType.MANAGED_IDENTITY
            else:
                component_type = ComponentType.GLOBAL_PARAMETER
        elif type_suffix in ("sqlscripts", "bigDataPools", "sqlPools"):
            component_type = ComponentType.CUSTOM_ACTIVITY
        
        if component_type is None:
            return None
        
        name = self._extract_component_name(resource.get("name", ""))
        definition = self._build_definition(resource, component_type)
        raw_depends_on = resource.get("dependsOn", [])
        resource_dependencies = self._parse_resource_dependencies(raw_depends_on)
        
        # Mark as Synapse resource
        if "resourceMetadata" not in definition:
            definition["resourceMetadata"] = {}
        definition["resourceMetadata"]["synapseWorkspace"] = True
        
        component = ADFComponent(
            name=name,
            type=component_type,
            definition=definition,
            is_selected=True,
            compatibility_status=CompatibilityStatus.SUPPORTED,
            warnings=[],
            fabric_target=self._generate_default_fabric_target(component_type, name, definition),
            depends_on=raw_depends_on,
            resource_dependencies=resource_dependencies,
        )
        
        if component_type == ComponentType.PIPELINE:
            component.folder = self._extract_folder_from_pipeline(component)
        
        if component_type == ComponentType.TRIGGER:
            component.trigger_metadata = self._extract_trigger_metadata(resource)
        
        return component
    
    def _build_definition(
        self, 
        resource: Dict[str, Any], 
        component_type: ComponentType
    ) -> Dict[str, Any]:
        """Build the component definition from resource properties."""
        properties = resource.get("properties", {})
        
        if component_type == ComponentType.PIPELINE:
            return {
                "type": "pipeline",
                "properties": {
                    "activities": properties.get("activities", []),
                    "parameters": properties.get("parameters", {}),
                    "variables": properties.get("variables", {}),
                    "annotations": properties.get("annotations", []),
                    "policy": properties.get("policy", {}),
                    "concurrency": properties.get("concurrency", 1),
                    "folder": properties.get("folder"),
                },
                "resourceMetadata": {
                    "armResourceType": resource.get("type"),
                    "armResourceName": resource.get("name"),
                },
            }
        elif component_type == ComponentType.DATASET:
            return {
                "type": "dataset",
                "properties": {
                    "type": properties.get("type"),
                    "typeProperties": properties.get("typeProperties", {}),
                    "linkedServiceName": properties.get("linkedServiceName"),
                    "parameters": properties.get("parameters", {}),
                    "annotations": properties.get("annotations", []),
                    "schema": properties.get("schema", []),
                },
            }
        elif component_type == ComponentType.LINKED_SERVICE:
            return {
                "type": "linkedService",
                "properties": {
                    "type": properties.get("type"),
                    "typeProperties": properties.get("typeProperties", {}),
                    "connectVia": properties.get("connectVia"),
                    "description": properties.get("description", ""),
                    "annotations": properties.get("annotations", []),
                },
            }
        elif component_type == ComponentType.TRIGGER:
            return {
                "type": "trigger",
                "properties": {
                    "type": properties.get("type"),
                    "typeProperties": properties.get("typeProperties", {}),
                    "pipelines": properties.get("pipelines", []),
                    "runtimeState": properties.get("runtimeState", "Stopped"),
                    "annotations": properties.get("annotations", []),
                },
            }
        else:
            return properties
    
    def _parse_resource_dependencies(
        self, 
        depends_on: List[str]
    ) -> ResourceDependencies:
        """Parse ARM template dependsOn array into categorized dependencies."""
        dependencies = ResourceDependencies()
        
        if not depends_on or not isinstance(depends_on, list):
            return dependencies
        
        for dep in depends_on:
            if not isinstance(dep, str):
                continue
            
            # Parse dependency strings like "[concat(variables('factoryId'), '/linkedServices/MyLS')]"
            match = re.search(
                r"/(linkedServices|pipelines|datasets|triggers|dataflows)/([^'\"\\]+)",
                dep,
                re.IGNORECASE
            )
            
            if match:
                resource_type, resource_name = match.groups()
                clean_name = re.sub(r"['\"\]\\),]+$", "", resource_name).strip()
                
                type_map = {
                    "linkedservices": dependencies.linked_services,
                    "pipelines": dependencies.pipelines,
                    "datasets": dependencies.datasets,
                    "triggers": dependencies.triggers,
                    "dataflows": dependencies.dataflows,
                }
                
                target_list = type_map.get(resource_type.lower())
                if target_list is not None and clean_name not in target_list:
                    target_list.append(clean_name)
            else:
                dependencies.other.append(dep)
        
        return dependencies
    
    def _generate_default_fabric_target(
        self, 
        component_type: ComponentType, 
        name: str,
        definition: Optional[Dict[str, Any]] = None
    ) -> Optional[FabricTarget]:
        """Generate default Fabric target for a component."""
        target_map = {
            ComponentType.PIPELINE: FabricTargetType.DATA_PIPELINE,
            ComponentType.LINKED_SERVICE: FabricTargetType.CONNECTOR,
            ComponentType.GLOBAL_PARAMETER: FabricTargetType.VARIABLE,
            ComponentType.MANAGED_IDENTITY: FabricTargetType.WORKSPACE_IDENTITY,
            ComponentType.TRIGGER: FabricTargetType.SCHEDULE,
            ComponentType.CUSTOM_ACTIVITY: FabricTargetType.NOTEBOOK,
            ComponentType.INTEGRATION_RUNTIME: FabricTargetType.GATEWAY,
        }
        
        target_type = target_map.get(component_type)
        if target_type is None:
            return None
        
        target = FabricTarget(type=target_type, name=name)
        
        # Add specific configurations
        if component_type == ComponentType.LINKED_SERVICE and definition:
            connect_via_obj = definition.get("properties", {}).get("connectVia")
            if isinstance(connect_via_obj, dict):
                connect_via = connect_via_obj.get("referenceName")
                if connect_via:
                    target.connect_via = connect_via
        
        if component_type == ComponentType.INTEGRATION_RUNTIME and definition:
            ir_type = definition.get("properties", {}).get("type")
            if ir_type == "Managed":
                target.gateway_type = GatewayType.VIRTUAL_NETWORK
            else:
                target.gateway_type = GatewayType.ON_PREMISES
        
        return target
    
    def _extract_folder_from_pipeline(
        self, 
        component: ADFComponent
    ) -> Optional[ADFFolderInfo]:
        """Extract folder information from pipeline definition."""
        folder = (
            component.definition.get("properties", {}).get("folder")
            or component.definition.get("folder")
        )
        
        if not folder or not isinstance(folder, dict):
            return None
        
        folder_name = folder.get("name", "")
        if not folder_name:
            return None
        
        segments = folder_name.split("/")
        
        return ADFFolderInfo(
            path=folder_name,
            name=segments[-1] if segments else folder_name,
            depth=len(segments) - 1,
            segments=segments,
            original_path=folder_name,
            parent_path="/".join(segments[:-1]) if len(segments) > 1 else None,
        )
    
    def _extract_trigger_metadata(self, resource: Dict[str, Any]) -> TriggerMetadata:
        """Extract trigger metadata from resource."""
        properties = resource.get("properties", {})
        type_properties = properties.get("typeProperties", {})
        recurrence_data = type_properties.get("recurrence")
        
        recurrence = None
        if recurrence_data:
            recurrence = TriggerRecurrence(
                frequency=recurrence_data.get("frequency", ""),
                interval=recurrence_data.get("interval", 0),
                start_time=recurrence_data.get("startTime"),
                end_time=recurrence_data.get("endTime"),
                time_zone=recurrence_data.get("timeZone", "UTC"),
            )
        
        # Extract pipeline references
        pipelines = properties.get("pipelines", [])
        referenced_pipelines = []
        pipeline_parameters = []
        
        for p in pipelines:
            pipeline_name = self._extract_pipeline_name_from_trigger_ref(p)
            if pipeline_name:
                referenced_pipelines.append(pipeline_name)
                pipeline_parameters.append({
                    "pipelineName": pipeline_name,
                    "parameters": p.get("parameters", {}),
                })
        
        return TriggerMetadata(
            runtime_state=properties.get("runtimeState", "Unknown"),
            type=properties.get("type", "Unknown"),
            recurrence=recurrence,
            referenced_pipelines=referenced_pipelines,
            pipeline_parameters=pipeline_parameters if pipeline_parameters else None,
        )
    
    def _extract_pipeline_name_from_trigger_ref(self, pipeline_ref: Any) -> Optional[str]:
        """Extract pipeline name from trigger pipeline reference."""
        if not pipeline_ref:
            return None
        
        # Format 1: Standard ADF
        if isinstance(pipeline_ref, dict):
            if pipeline_ref.get("pipelineReference", {}).get("referenceName"):
                return pipeline_ref["pipelineReference"]["referenceName"]
            if pipeline_ref.get("referenceName"):
                return pipeline_ref["referenceName"]
            if pipeline_ref.get("type") == "PipelineReference" and pipeline_ref.get("name"):
                return pipeline_ref["name"]
        
        # Format 2: String reference
        if isinstance(pipeline_ref, str):
            match = re.search(r"/pipelines/([^'\"\\]+)", pipeline_ref, re.IGNORECASE)
            if match:
                return match.group(1).strip()
            return pipeline_ref
        
        return None
    
    def _validate_component(self, component: ADFComponent) -> ADFComponent:
        """Apply validation rules to a component."""
        rule = self._validation_rules.get(component.type.value)
        
        if not rule:
            return component
        
        status = CompatibilityStatus.SUPPORTED if rule.is_supported else CompatibilityStatus.UNSUPPORTED
        warnings = list(rule.warnings)
        
        # Add specific warnings based on component content
        if component.type == ComponentType.LINKED_SERVICE:
            service_type = component.definition.get("properties", {}).get("type", "")
            if service_type == "SelfHosted":
                warnings.append("Self-hosted linked service requires On-Premises Data Gateway configuration")
        
        if component.type == ComponentType.PIPELINE:
            activities = component.definition.get("properties", {}).get("activities", [])
            unsupported = [
                a for a in activities 
                if isinstance(a, dict) and a.get("type") in ("ExecuteDataFlow", "DataLakeAnalyticsU-SQL")
            ]
            if unsupported:
                warnings.append(f"Contains {len(unsupported)} unsupported activity type(s)")
        
        component.compatibility_status = status
        component.warnings = warnings
        component.is_selected = status == CompatibilityStatus.SUPPORTED
        
        return component
    
    def get_component_summary(
        self, 
        components: Optional[List[ADFComponent]] = None
    ) -> ComponentSummary:
        """
        Generate a summary of parsed components.
        
        Args:
            components: List of components (uses cached if not provided).
            
        Returns:
            ComponentSummary object.
        """
        components = components or self._parsed_components
        
        summary = ComponentSummary(
            total=len(components),
            supported=0,
            partially_supported=0,
            unsupported=0,
            by_type={},
        )
        
        parameterized_ls_names = set()
        affected_pipelines = set()
        
        for component in components:
            if component.compatibility_status == CompatibilityStatus.SUPPORTED:
                summary.supported += 1
            elif component.compatibility_status == CompatibilityStatus.PARTIALLY_SUPPORTED:
                summary.partially_supported += 1
            else:
                summary.unsupported += 1
            
            type_name = component.type.value
            summary.by_type[type_name] = summary.by_type.get(type_name, 0) + 1
        
        summary.parameterized_linked_services_count = len(parameterized_ls_names)
        summary.parameterized_linked_services_names = list(parameterized_ls_names)
        summary.parameterized_linked_services_pipeline_count = len(affected_pipelines)
        
        return summary
    
    def get_dataset_by_name(self, dataset_name: str) -> Optional[ADFComponent]:
        """Get a dataset by name."""
        for component in self._parsed_components:
            if component.type == ComponentType.DATASET and component.name == dataset_name:
                return component
        
        if dataset_name in self._dataset_mappings:
            return ADFComponent(
                name=dataset_name,
                type=ComponentType.DATASET,
                definition=self._dataset_mappings[dataset_name],
            )
        
        return None
    
    def get_linked_service_by_name(self, name: str) -> Optional[ADFComponent]:
        """Get a linked service by name."""
        for component in self._parsed_components:
            if component.type == ComponentType.LINKED_SERVICE and component.name == name:
                return component
        
        if name in self._linked_service_mappings:
            return ADFComponent(
                name=name,
                type=ComponentType.LINKED_SERVICE,
                definition=self._linked_service_mappings[name],
            )
        
        return None
    
    def get_components_by_type(self, component_type: ComponentType) -> List[ADFComponent]:
        """Get all components of a specific type."""
        return [c for c in self._parsed_components if c.type == component_type]
    
    def get_parsed_components(self) -> List[ADFComponent]:
        """Get all parsed components."""
        return self._parsed_components.copy()
    
    def generate_profile(
        self, 
        components: List[ADFComponent], 
        file_name: str, 
        file_size: int
    ) -> ADFProfile:
        """
        Generate a comprehensive profile from parsed components.
        
        Args:
            components: List of parsed components.
            file_name: Name of the ARM template file.
            file_size: Size of the file in bytes.
            
        Returns:
            ADFProfile object with complete analysis.
        """
        metrics = self._calculate_metrics(components)
        artifacts = self._build_artifact_breakdown(components)
        dependencies = self._build_dependency_graph(components, artifacts)
        insights = self._generate_insights(metrics, artifacts)
        
        return ADFProfile(
            metadata={
                "fileName": file_name,
                "fileSize": file_size,
                "parsedAt": None,  # Will be set by caller
                "templateVersion": "1.0.0",
                "factoryName": self._extract_factory_name(components),
            },
            metrics=metrics,
            artifacts=artifacts,
            dependencies=dependencies,
            insights=insights,
        )
    
    def _calculate_metrics(self, components: List[ADFComponent]) -> ProfileMetrics:
        """Calculate comprehensive metrics from components."""
        pipelines = [c for c in components if c.type == ComponentType.PIPELINE]
        datasets = [c for c in components if c.type == ComponentType.DATASET]
        linked_services = [c for c in components if c.type == ComponentType.LINKED_SERVICE]
        triggers = [c for c in components if c.type == ComponentType.TRIGGER]
        dataflows = [c for c in components if c.type == ComponentType.MAPPING_DATA_FLOW]
        integration_runtimes = [c for c in components if c.type == ComponentType.INTEGRATION_RUNTIME]
        global_parameters = [c for c in components if c.type == ComponentType.GLOBAL_PARAMETER]
        
        # Calculate activity statistics
        total_activities = 0
        activities_by_type: Dict[str, int] = {}
        max_activities = 0
        max_pipeline_name = ""
        custom_activities_count = 0
        total_custom_refs = 0
        custom_multi_refs = 0
        
        for pipeline in pipelines:
            activities = pipeline.definition.get("properties", {}).get("activities", [])
            count = len(activities)
            total_activities += count
            
            if count > max_activities:
                max_activities = count
                max_pipeline_name = pipeline.name
            
            for activity in activities:
                if not isinstance(activity, dict):
                    continue
                    
                act_type = activity.get("type", "Unknown")
                activities_by_type[act_type] = activities_by_type.get(act_type, 0) + 1
                
                if act_type == "Custom":
                    custom_activities_count += 1
                    ref_count = self._count_custom_activity_references(activity)
                    total_custom_refs += ref_count
                    if ref_count >= 2:
                        custom_multi_refs += 1
        
        # Calculate pipeline dependencies
        pipeline_deps = 0
        for pipeline in pipelines:
            activities = pipeline.definition.get("properties", {}).get("activities", [])
            for activity in activities:
                if isinstance(activity, dict) and activity.get("type") == "ExecutePipeline":
                    pipeline_deps += 1
        
        # Calculate trigger-pipeline mappings
        trigger_mappings = sum(
            len(t.trigger_metadata.referenced_pipelines) if t.trigger_metadata else 0
            for t in triggers
        )
        
        return ProfileMetrics(
            total_pipelines=len(pipelines),
            total_datasets=len(datasets),
            total_linked_services=len(linked_services),
            total_triggers=len(triggers),
            total_dataflows=len(dataflows),
            total_integration_runtimes=len(integration_runtimes),
            total_global_parameters=len(global_parameters),
            total_activities=total_activities,
            activities_by_type=activities_by_type,
            avg_activities_per_pipeline=total_activities / len(pipelines) if pipelines else 0,
            max_activities_per_pipeline=max_activities,
            max_activities_pipeline_name=max_pipeline_name,
            custom_activities_count=custom_activities_count,
            total_custom_activity_references=total_custom_refs,
            custom_activities_with_multiple_references=custom_multi_refs,
            pipeline_dependencies=pipeline_deps,
            trigger_pipeline_mappings=trigger_mappings,
        )
    
    def _count_custom_activity_references(self, activity: Dict[str, Any]) -> int:
        """Count LinkedService references in a Custom activity."""
        count = 0
        
        if activity.get("linkedServiceName", {}).get("referenceName"):
            count += 1
        
        type_props = activity.get("typeProperties", {})
        
        if type_props.get("resourceLinkedService", {}).get("referenceName"):
            count += 1
        
        ref_objects = type_props.get("referenceObjects", {}).get("linkedServices", [])
        if isinstance(ref_objects, list):
            count += len(ref_objects)
        
        return count
    
    def _build_artifact_breakdown(self, components: List[ADFComponent]) -> ArtifactBreakdown:
        """Build detailed artifact breakdown."""
        pipelines = [c for c in components if c.type == ComponentType.PIPELINE]
        datasets = [c for c in components if c.type == ComponentType.DATASET]
        linked_services = [c for c in components if c.type == ComponentType.LINKED_SERVICE]
        triggers = [c for c in components if c.type == ComponentType.TRIGGER]
        dataflows = [c for c in components if c.type == ComponentType.MAPPING_DATA_FLOW]
        
        # Build usage statistics
        triggers_per_pipeline: Dict[str, List[str]] = {}
        for trigger in triggers:
            if trigger.trigger_metadata:
                for pipeline_name in trigger.trigger_metadata.referenced_pipelines:
                    if pipeline_name not in triggers_per_pipeline:
                        triggers_per_pipeline[pipeline_name] = []
                    triggers_per_pipeline[pipeline_name].append(trigger.name)
        
        pipelines_per_dataset: Dict[str, int] = {}
        datasets_per_ls: Dict[str, int] = {}
        
        for pipeline in pipelines:
            activities = pipeline.definition.get("properties", {}).get("activities", [])
            for activity in activities:
                if not isinstance(activity, dict):
                    continue
                for inp in activity.get("inputs", []):
                    if isinstance(inp, dict) and inp.get("referenceName"):
                        ds_name = inp["referenceName"]
                        pipelines_per_dataset[ds_name] = pipelines_per_dataset.get(ds_name, 0) + 1
                for out in activity.get("outputs", []):
                    if isinstance(out, dict) and out.get("referenceName"):
                        ds_name = out["referenceName"]
                        pipelines_per_dataset[ds_name] = pipelines_per_dataset.get(ds_name, 0) + 1
        
        for dataset in datasets:
            ls_name = dataset.definition.get("properties", {}).get("linkedServiceName", {}).get("referenceName")
            if ls_name:
                datasets_per_ls[ls_name] = datasets_per_ls.get(ls_name, 0) + 1
        
        return ArtifactBreakdown(
            pipelines=self._build_pipeline_artifacts(pipelines, triggers_per_pipeline),
            datasets=self._build_dataset_artifacts(datasets, pipelines_per_dataset),
            linked_services=self._build_linked_service_artifacts(linked_services, datasets_per_ls),
            triggers=self._build_trigger_artifacts(triggers),
            dataflows=[{"name": df.name} for df in dataflows],
        )
    
    def _build_pipeline_artifacts(
        self, 
        pipelines: List[ADFComponent],
        triggers_per_pipeline: Dict[str, List[str]]
    ) -> List[PipelineArtifact]:
        """Build pipeline artifact list."""
        artifacts = []
        
        for pipeline in pipelines:
            props = pipeline.definition.get("properties", {})
            activities = props.get("activities", [])
            
            activity_summaries = [
                ActivitySummary(
                    name=a.get("name", "Unnamed"),
                    type=a.get("type", "Unknown"),
                    description=a.get("description"),
                    is_custom_activity=a.get("type") == "Custom",
                )
                for a in activities if isinstance(a, dict)
            ]
            
            uses_datasets = []
            executes_pipelines = []
            uses_linked_services = []
            
            for activity in activities:
                if not isinstance(activity, dict):
                    continue
                    
                for inp in activity.get("inputs", []):
                    if isinstance(inp, dict) and inp.get("referenceName"):
                        uses_datasets.append(inp["referenceName"])
                for out in activity.get("outputs", []):
                    if isinstance(out, dict) and out.get("referenceName"):
                        uses_datasets.append(out["referenceName"])
                
                if activity.get("type") == "ExecutePipeline":
                    ref = activity.get("typeProperties", {}).get("pipeline", {}).get("referenceName")
                    if ref:
                        executes_pipelines.append(ref)
            
            artifacts.append(PipelineArtifact(
                name=pipeline.name,
                activity_count=len(activities),
                activities=activity_summaries,
                parameter_count=len(props.get("parameters", {})),
                triggered_by=triggers_per_pipeline.get(pipeline.name, []),
                uses_datasets=list(set(uses_datasets)),
                executes_pipelines=list(set(executes_pipelines)),
                uses_linked_services=list(set(uses_linked_services)),
                folder=pipeline.folder.path if pipeline.folder else None,
            ))
        
        return artifacts
    
    def _build_dataset_artifacts(
        self, 
        datasets: List[ADFComponent],
        pipelines_per_dataset: Dict[str, int]
    ) -> List[DatasetArtifact]:
        """Build dataset artifact list."""
        return [
            DatasetArtifact(
                name=ds.name,
                type=ds.definition.get("properties", {}).get("type", "Unknown"),
                linked_service=ds.definition.get("properties", {}).get("linkedServiceName", {}).get("referenceName", "Unknown"),
                usage_count=pipelines_per_dataset.get(ds.name, 0),
            )
            for ds in datasets
        ]
    
    def _build_linked_service_artifacts(
        self, 
        linked_services: List[ADFComponent],
        datasets_per_ls: Dict[str, int]
    ) -> List[LinkedServiceArtifact]:
        """Build linked service artifact list."""
        return [
            LinkedServiceArtifact(
                name=ls.name,
                type=ls.definition.get("properties", {}).get("type", "Unknown"),
                usage_score=datasets_per_ls.get(ls.name, 0) * 2,
            )
            for ls in linked_services
        ]
    
    def _build_trigger_artifacts(self, triggers: List[ADFComponent]) -> List[TriggerArtifact]:
        """Build trigger artifact list."""
        return [
            TriggerArtifact(
                name=t.name,
                type=t.trigger_metadata.type if t.trigger_metadata else "Unknown",
                status=t.trigger_metadata.runtime_state if t.trigger_metadata else "Unknown",
                pipelines=t.trigger_metadata.referenced_pipelines if t.trigger_metadata else [],
                recurrence=t.trigger_metadata.recurrence.__dict__ if t.trigger_metadata and t.trigger_metadata.recurrence else None,
            )
            for t in triggers
        ]
    
    def _build_dependency_graph(
        self, 
        components: List[ADFComponent],
        artifacts: ArtifactBreakdown
    ) -> DependencyGraph:
        """Build dependency graph for visualization."""
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []
        
        # Create nodes
        for p in artifacts.pipelines:
            nodes.append(GraphNode(
                id=f"pipeline_{p.name}",
                type="pipeline",
                label=p.name,
                metadata={"activityCount": p.activity_count},
                fabric_target="Data Pipeline",
                criticality="high" if len(p.triggered_by) > 2 else "medium" if p.triggered_by else "low",
            ))
        
        for d in artifacts.datasets:
            nodes.append(GraphNode(
                id=f"dataset_{d.name}",
                type="dataset",
                label=d.name,
                metadata={"usageCount": d.usage_count},
                fabric_target="Embedded in Activity",
            ))
        
        for ls in artifacts.linked_services:
            nodes.append(GraphNode(
                id=f"linkedService_{ls.name}",
                type="linkedService",
                label=ls.name,
                fabric_target="Connection",
            ))
        
        for t in artifacts.triggers:
            nodes.append(GraphNode(
                id=f"trigger_{t.name}",
                type="trigger",
                label=t.name,
                fabric_target="Pipeline Schedule",
            ))
        
        # Create edges
        for t in artifacts.triggers:
            for p_name in t.pipelines:
                edges.append(GraphEdge(
                    source=f"trigger_{t.name}",
                    target=f"pipeline_{p_name}",
                    type="triggers",
                    label="triggers",
                ))
        
        for p in artifacts.pipelines:
            for ds_name in p.uses_datasets:
                edges.append(GraphEdge(
                    source=f"pipeline_{p.name}",
                    target=f"dataset_{ds_name}",
                    type="uses",
                    label="uses",
                ))
            for target in p.executes_pipelines:
                edges.append(GraphEdge(
                    source=f"pipeline_{p.name}",
                    target=f"pipeline_{target}",
                    type="executes",
                    label="executes",
                ))
        
        for d in artifacts.datasets:
            if d.linked_service != "Unknown":
                edges.append(GraphEdge(
                    source=f"dataset_{d.name}",
                    target=f"linkedService_{d.linked_service}",
                    type="references",
                    label="references",
                ))
        
        return DependencyGraph(nodes=nodes, edges=edges)
    
    def _generate_insights(
        self, 
        metrics: ProfileMetrics, 
        artifacts: ArtifactBreakdown
    ) -> List[ProfileInsight]:
        """Generate insights based on metrics and artifacts."""
        insights = []
        
        # Factory scale insight
        insights.append(ProfileInsight(
            id="factory_scale",
            icon="📊",
            title="Factory Scale Overview",
            description=f"This data factory contains {metrics.total_pipelines} pipelines with a total of {metrics.total_activities} activities. The average pipeline complexity is {metrics.avg_activities_per_pipeline:.1f} activities.",
            severity="info",
            metric=metrics.total_pipelines,
        ))
        
        # Complex pipeline warning
        if metrics.max_activities_per_pipeline > 10:
            insights.append(ProfileInsight(
                id="complex_pipeline",
                icon="⚠️",
                title="High Complexity Pipeline Detected",
                description=f'Pipeline "{metrics.max_activities_pipeline_name}" contains {metrics.max_activities_per_pipeline} activities, which may require extra attention during migration.',
                severity="warning",
                metric=metrics.max_activities_per_pipeline,
                recommendation="Consider breaking down complex pipelines into smaller, more manageable units in Fabric.",
            ))
        
        # Trigger migration info
        if metrics.total_triggers > 0:
            insights.append(ProfileInsight(
                id="trigger_migration",
                icon="⏰",
                title="Trigger Migration Required",
                description=f"Found {metrics.total_triggers} triggers that will need to be recreated as pipeline schedules in Fabric.",
                severity="info",
                metric=metrics.total_triggers,
                recommendation="Review trigger schedules and ensure they align with Fabric scheduling capabilities.",
            ))
        
        # Unsupported dataflows
        if metrics.total_dataflows > 0:
            insights.append(ProfileInsight(
                id="unsupported_dataflows",
                icon="❌",
                title="Mapping Dataflows Require Manual Migration",
                description=f"Found {metrics.total_dataflows} mapping dataflows that are not directly supported in Fabric Data Pipelines.",
                severity="critical",
                metric=metrics.total_dataflows,
                recommendation="Plan to recreate dataflow logic using Fabric Dataflow Gen2 or Notebooks.",
            ))
        
        return insights
    
    def _extract_factory_name(self, components: List[ADFComponent]) -> str:
        """Extract factory name from components."""
        return "Azure Data Factory"


# Singleton instance for convenience
adf_parser = ADFParser()
