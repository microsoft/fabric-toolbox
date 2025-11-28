"""
Pipeline Transformer for ADF to Fabric migration.

This module provides comprehensive transformation of ADF pipeline definitions
to Microsoft Fabric Data Pipeline format.
"""

import base64
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from .activity_transformer import ActivityTransformer, activity_transformer
from .models import ADFComponent, GlobalParameterReference

logger = logging.getLogger(__name__)


class PipelineTransformer:
    """
    Transformer for ADF pipelines to Fabric Data Pipeline format.
    
    This class handles the complete transformation of ADF pipeline definitions,
    including activity transformation, parameter conversion, and global parameter
    expression rewriting.
    
    Example:
        >>> transformer = PipelineTransformer()
        >>> fabric_pipeline = transformer.transform_pipeline_definition(adf_pipeline)
        >>> print(json.dumps(fabric_pipeline, indent=2))
    """
    
    def __init__(self):
        """Initialize the pipeline transformer."""
        self._activity_transformer = activity_transformer
        self._current_pipeline_name = ""
        self._reference_mappings: Dict[str, Dict[str, str]] = {}
        self._linked_service_bridge: Dict[str, Dict[str, Any]] = {}
    
    def set_reference_mappings(
        self, 
        mappings: Dict[str, Dict[str, str]]
    ) -> None:
        """
        Set reference mappings for Custom activity transformation.
        
        Args:
            mappings: Dictionary mapping pipeline names to referenceId->connectionId mappings.
        """
        self._reference_mappings = mappings
    
    def set_linked_service_bridge(
        self, 
        bridge: Dict[str, Dict[str, Any]]
    ) -> None:
        """
        Set LinkedService bridge for connection mappings.
        
        Args:
            bridge: Dictionary mapping LinkedService names to connection details.
        """
        self._linked_service_bridge = bridge
    
    def set_connection_mappings(self, mappings: Dict[str, str]) -> None:
        """
        Set connection mappings for LinkedService to Fabric connection conversion.
        
        Args:
            mappings: Dictionary mapping LinkedService names to Fabric connection IDs.
        """
        self._activity_transformer.set_connection_mappings(mappings)
    
    def transform_pipeline_definition(
        self, 
        definition: Dict[str, Any],
        pipeline_name: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Transform an ADF pipeline definition to Fabric format.
        
        Args:
            definition: The ADF pipeline definition.
            pipeline_name: Name of the pipeline.
            
        Returns:
            Transformed Fabric pipeline definition.
        """
        self._current_pipeline_name = pipeline_name
        
        if not definition:
            logger.warning("No pipeline definition provided")
            return {"properties": {}}
        
        # Extract pipeline properties
        pipeline_properties: Dict[str, Any] = {}
        if isinstance(definition.get("properties"), dict):
            pipeline_properties = definition["properties"]
        elif any(k in definition for k in ("activities", "parameters", "variables")):
            pipeline_properties = definition
        
        # Extract components
        activities = self._extract_activities(pipeline_properties)
        parameters = self._extract_parameters(pipeline_properties)
        variables = self._extract_variables(pipeline_properties)
        
        # Build Fabric pipeline definition
        fabric_definition = {
            "properties": {
                "activities": self._transform_activities(activities),
                "parameters": parameters,
                "variables": variables,
                "annotations": pipeline_properties.get("annotations", []),
                "concurrency": self._extract_concurrency(pipeline_properties),
                "policy": self._extract_policy(pipeline_properties),
            }
        }
        
        # Add optional properties if present
        if pipeline_properties.get("folder"):
            fabric_definition["properties"]["folder"] = pipeline_properties["folder"]
        if pipeline_properties.get("description"):
            fabric_definition["properties"]["description"] = pipeline_properties["description"]
        
        # Validate transformation
        input_count = len(activities)
        output_count = len(fabric_definition["properties"]["activities"])
        
        if input_count > 0 and output_count == 0:
            logger.error(
                f"CRITICAL: Activities were lost during transformation! "
                f"Input: {input_count}, Output: {output_count}"
            )
        
        return fabric_definition
    
    def _extract_activities(self, properties: Dict[str, Any]) -> List[Any]:
        """Extract activities from pipeline properties."""
        if not properties:
            return []
        
        possible_sources = [
            properties.get("activities"),
            properties.get("Activities"),
            properties.get("pipelineActivities"),
            properties.get("definition", {}).get("activities") if isinstance(properties.get("definition"), dict) else None,
        ]
        
        for source in possible_sources:
            if isinstance(source, list) and source:
                return source
        
        return []
    
    def _extract_parameters(self, properties: Dict[str, Any]) -> Dict[str, Any]:
        """Extract parameters from pipeline properties."""
        if not properties:
            return {}
        return properties.get("parameters") or properties.get("Parameters") or {}
    
    def _extract_variables(self, properties: Dict[str, Any]) -> Dict[str, Any]:
        """Extract variables from pipeline properties."""
        if not properties:
            return {}
        return properties.get("variables") or properties.get("Variables") or {}
    
    def _extract_concurrency(self, properties: Dict[str, Any]) -> int:
        """Extract concurrency from pipeline properties."""
        if not properties:
            return 1
        concurrency = properties.get("concurrency") or properties.get("Concurrency")
        return concurrency if isinstance(concurrency, int) and concurrency > 0 else 1
    
    def _extract_policy(self, properties: Dict[str, Any]) -> Dict[str, Any]:
        """Extract policy from pipeline properties."""
        if not properties:
            return {}
        return properties.get("policy") or properties.get("Policy") or {}
    
    def _transform_activities(self, activities: List[Any]) -> List[Any]:
        """Transform all activities in the pipeline."""
        if not isinstance(activities, list):
            return []
        
        transformed = []
        for activity in activities:
            if not isinstance(activity, dict):
                continue
            
            # Transform activity based on type
            activity_type = activity.get("type", "")
            
            if activity_type == "ExecutePipeline":
                transformed_activity = self._transform_execute_pipeline(activity)
            elif activity_type in ("Copy", "Custom"):
                # These are handled by specialized transformers
                transformed_activity = self._transform_specialized_activity(activity)
            else:
                transformed_activity = self._activity_transformer.transform_activity(
                    activity, 
                    self._current_pipeline_name
                )
            
            # Apply common transformations
            final_activity = self._finalize_activity(transformed_activity)
            transformed.append(final_activity)
        
        return transformed
    
    def _transform_execute_pipeline(self, activity: Dict[str, Any]) -> Dict[str, Any]:
        """Transform ExecutePipeline to InvokePipeline for Fabric."""
        if activity.get("type") != "ExecutePipeline":
            return activity
        
        type_properties = activity.get("typeProperties", {})
        
        return {
            "name": activity.get("name"),
            "type": "InvokePipeline",
            "dependsOn": activity.get("dependsOn", []),
            "policy": {
                "timeout": activity.get("policy", {}).get("timeout", "0.12:00:00"),
                "retry": activity.get("policy", {}).get("retry", 0),
                "retryIntervalInSeconds": activity.get("policy", {}).get("retryIntervalInSeconds", 30),
                "secureOutput": activity.get("policy", {}).get("secureOutput", False),
                "secureInput": activity.get("policy", {}).get("secureInput", False),
            },
            "userProperties": activity.get("userProperties", []),
            "typeProperties": {
                "waitOnCompletion": type_properties.get("waitOnCompletion", True),
                "operationType": "InvokeFabricPipeline",
                "pipelineId": "",  # Will be populated during deployment
                "workspaceId": "",  # Will be populated during deployment
                "parameters": type_properties.get("parameters", {}),
            },
            "externalReferences": {
                "connection": "",  # Will be populated during deployment
            },
            "_originalTargetPipeline": type_properties.get("pipeline", {}).get("referenceName"),
        }
    
    def _transform_specialized_activity(self, activity: Dict[str, Any]) -> Dict[str, Any]:
        """Handle specialized activity types (Copy, Custom)."""
        # For now, return as-is - specialized transformers would handle these
        return activity
    
    def _finalize_activity(self, activity: Dict[str, Any]) -> Dict[str, Any]:
        """Apply final common transformations to an activity."""
        if not isinstance(activity, dict):
            return activity
        
        # Ensure required fields
        if "name" not in activity:
            activity["name"] = f"activity_{id(activity)}"
        if "type" not in activity:
            activity["type"] = "Unknown"
        
        # Transform dependencies
        if "dependsOn" in activity:
            activity["dependsOn"] = self._transform_dependencies(activity["dependsOn"])
        else:
            activity["dependsOn"] = []
        
        # Ensure other required fields
        if "userProperties" not in activity:
            activity["userProperties"] = []
        if "policy" not in activity:
            activity["policy"] = {}
        
        # Override connectVia to empty object (Fabric doesn't support IntegrationRuntimeReference)
        activity["connectVia"] = {}
        
        # Remove ADF-specific properties
        for key in ["linkedServiceName", "linkedService"]:
            if key in activity:
                del activity[key]
        
        return activity
    
    def _transform_dependencies(self, dependencies: List[Any]) -> List[Any]:
        """Transform activity dependencies."""
        if not isinstance(dependencies, list):
            return []
        
        return [
            {
                "activity": dep.get("activity", ""),
                "dependencyConditions": dep.get("dependencyConditions", ["Succeeded"]),
                **{k: v for k, v in dep.items() if k not in ("activity", "dependencyConditions")}
            }
            for dep in dependencies
            if isinstance(dep, dict)
        ]
    
    def inject_library_variables(
        self,
        pipeline_definition: Dict[str, Any],
        library_name: str,
        variable_names_with_types: List[Tuple[str, str]]
    ) -> Dict[str, Any]:
        """
        Inject library variable references into pipeline definition.
        
        Creates the libraryVariables section that maps library variables to the pipeline.
        
        Args:
            pipeline_definition: Transformed pipeline definition.
            library_name: Display name of the Variable Library.
            variable_names_with_types: List of (variable_name, fabric_type) tuples.
            
        Returns:
            Modified pipeline definition with libraryVariables section.
        """
        logger.info(
            f"Injecting {len(variable_names_with_types)} library variables "
            f'from "{library_name}"'
        )
        
        if not pipeline_definition.get("properties"):
            logger.warning("No properties found in pipeline definition")
            return pipeline_definition
        
        # Create libraryVariables section
        library_variables: Dict[str, Any] = {}
        
        for name, fabric_type in variable_names_with_types:
            key = f"{library_name}_VariableLibrary_{name}"
            library_variables[key] = {
                "type": fabric_type,
                "variableName": f"VariableLibrary_{name}",
                "libraryName": library_name,
            }
        
        # Inject into pipeline properties
        pipeline_definition["properties"]["libraryVariables"] = library_variables
        
        logger.info(
            f"Successfully injected libraryVariables section with keys: "
            f"{list(library_variables.keys())}"
        )
        
        return pipeline_definition
    
    def transform_global_parameter_expressions(
        self,
        pipeline_definition: Dict[str, Any],
        parameter_names: List[str],
        library_name: str
    ) -> Dict[str, Any]:
        """
        Transform global parameter expressions to library variable expressions.
        
        Replaces: @pipeline().globalParameters.X
        With: @pipeline().libraryVariables.LibraryName_VariableLibrary_X
        
        Args:
            pipeline_definition: Transformed pipeline definition.
            parameter_names: Array of original global parameter names.
            library_name: Display name of the Variable Library.
            
        Returns:
            Modified pipeline definition with transformed expressions.
        """
        logger.info(
            f"Transforming global parameter expressions for "
            f"{len(parameter_names)} parameters"
        )
        
        if not pipeline_definition.get("properties"):
            logger.warning("No properties found in pipeline definition")
            return pipeline_definition
        
        # Convert to JSON string for regex replacement
        pipeline_json = json.dumps(pipeline_definition)
        
        for param_name in parameter_names:
            library_var_key = f"{library_name}_VariableLibrary_{param_name}"
            
            # Pattern 1: @pipeline().globalParameters.X
            pattern1 = re.compile(
                rf"@pipeline\(\)\.globalParameters\.{re.escape(param_name)}(?!\w)"
            )
            replacement1 = f"@pipeline().libraryVariables.{library_var_key}"
            
            # Pattern 2: @{{pipeline().globalParameters.X}}
            pattern2 = re.compile(
                rf"@\{{pipeline\(\)\.globalParameters\.{re.escape(param_name)}\}}"
            )
            replacement2 = f"@{{pipeline().libraryVariables.{library_var_key}}}"
            
            # Pattern 3: pipeline().globalParameters.X (function-wrapped)
            pattern3 = re.compile(
                rf"(?<!@)pipeline\(\)\.globalParameters\.{re.escape(param_name)}(?!\w)"
            )
            replacement3 = f"pipeline().libraryVariables.{library_var_key}"
            
            # Count matches
            count1 = len(pattern1.findall(pipeline_json))
            count2 = len(pattern2.findall(pipeline_json))
            count3 = len(pattern3.findall(pipeline_json))
            
            # Apply replacements
            pipeline_json = pattern1.sub(replacement1, pipeline_json)
            pipeline_json = pattern2.sub(replacement2, pipeline_json)
            pipeline_json = pattern3.sub(replacement3, pipeline_json)
            
            total = count1 + count2 + count3
            if total > 0:
                logger.info(
                    f'Transformed "{param_name}": {total} occurrences → {library_var_key}'
                )
        
        # Parse back to object
        transformed_definition = json.loads(pipeline_json)
        logger.info("Expression transformation complete")
        
        return transformed_definition
    
    def generate_fabric_pipeline_payload(
        self, 
        pipeline_definition: Dict[str, Any]
    ) -> str:
        """
        Generate Base64-encoded payload for Fabric API.
        
        Args:
            pipeline_definition: The transformed pipeline definition.
            
        Returns:
            Base64-encoded JSON string.
        """
        # Clean the definition for Fabric
        cleaned = self._clean_pipeline_for_fabric(pipeline_definition)
        
        # Convert to JSON and encode
        json_str = json.dumps(cleaned, ensure_ascii=False)
        return base64.b64encode(json_str.encode("utf-8")).decode("utf-8")
    
    def _clean_pipeline_for_fabric(
        self, 
        pipeline_definition: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Clean pipeline definition for Fabric deployment.
        
        Removes ADF-specific properties that Fabric doesn't support.
        """
        import copy
        cleaned = copy.deepcopy(pipeline_definition)
        
        # Remove ADF-specific top-level properties
        adf_only_props = [
            "resourceMetadata",
            "dependsOn",
            "_originalTargetPipeline",
        ]
        
        for prop in adf_only_props:
            if prop in cleaned:
                del cleaned[prop]
        
        # Clean activities
        activities = cleaned.get("properties", {}).get("activities", [])
        for activity in activities:
            if isinstance(activity, dict):
                # Remove ADF-specific activity properties
                for prop in adf_only_props:
                    if prop in activity:
                        del activity[prop]
        
        return cleaned
    
    def transform_pipeline_with_global_parameters(
        self,
        pipeline_definition: Dict[str, Any],
        global_parameters: List[GlobalParameterReference],
        library_name: str
    ) -> Dict[str, Any]:
        """
        Transform pipeline with global parameter migration.
        
        This is a convenience method that applies both library variable injection
        and expression transformation.
        
        Args:
            pipeline_definition: The pipeline definition to transform.
            global_parameters: List of global parameter references.
            library_name: Name of the Variable Library.
            
        Returns:
            Fully transformed pipeline definition.
        """
        # Inject library variables
        variable_names_with_types = [
            (gp.name, gp.fabric_data_type) for gp in global_parameters
        ]
        pipeline_definition = self.inject_library_variables(
            pipeline_definition, 
            library_name, 
            variable_names_with_types
        )
        
        # Transform expressions
        parameter_names = [gp.name for gp in global_parameters]
        pipeline_definition = self.transform_global_parameter_expressions(
            pipeline_definition,
            parameter_names,
            library_name
        )
        
        return pipeline_definition


# Singleton instance for convenience
pipeline_transformer = PipelineTransformer()
