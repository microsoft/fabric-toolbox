"""
Activity Transformer for ADF to Fabric migration.

This module provides transformation logic for individual ADF activities
to Microsoft Fabric format.
"""

import copy
import json
import logging
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class ActivityTransformer:
    """
    Transformer for ADF activities to Fabric format.
    
    This class handles the transformation of individual activities,
    including LinkedService reference conversion, expression transformation,
    and activity-specific property adjustments.
    """
    
    def __init__(self, enable_databricks_to_trident: bool = False):
        """
        Initialize the activity transformer.
        
        Args:
            enable_databricks_to_trident: When True, transforms DatabricksNotebook 
                activities to TridentNotebook format with appropriate property mappings.
        """
        self._failed_connectors: Set[str] = set()
        self._connection_mappings: Dict[str, str] = {}
        self._enable_databricks_to_trident = enable_databricks_to_trident
    
    def set_databricks_to_trident(self, enabled: bool) -> None:
        """
        Enable or disable DatabricksNotebook to TridentNotebook transformation.
        
        Args:
            enabled: When True, transforms DatabricksNotebook activities to TridentNotebook.
        """
        self._enable_databricks_to_trident = enabled
    
    def set_connection_mappings(self, mappings: Dict[str, str]) -> None:
        """
        Set connection mappings for LinkedService to Fabric connection conversion.
        
        Args:
            mappings: Dictionary mapping LinkedService names to Fabric connection IDs.
        """
        self._connection_mappings = mappings
    
    def set_failed_connectors(self, failed: Set[str]) -> None:
        """
        Set the list of failed connectors.
        
        Args:
            failed: Set of LinkedService names that failed to deploy.
        """
        self._failed_connectors = failed
    
    def get_failed_connectors(self) -> Set[str]:
        """Get the set of failed connectors."""
        return self._failed_connectors
    
    def map_linked_service_to_connection(self, linked_service_name: str) -> Optional[str]:
        """
        Map a LinkedService name to a Fabric connection ID.
        
        Args:
            linked_service_name: The ADF LinkedService name.
            
        Returns:
            The Fabric connection ID, or None if not found.
        """
        return self._connection_mappings.get(linked_service_name)
    
    def transform_activity(
        self, 
        activity: Dict[str, Any],
        pipeline_name: str = "unknown"
    ) -> Dict[str, Any]:
        """
        Transform a single ADF activity to Fabric format.
        
        Args:
            activity: The ADF activity definition.
            pipeline_name: Name of the parent pipeline (for context).
            
        Returns:
            Transformed activity definition.
        """
        if not activity or not isinstance(activity, dict):
            return activity
        
        activity_type = activity.get("type", "")
        
        # Skip Copy and Custom activities - they have specialized transformers
        if activity_type in ("Copy", "Custom"):
            return activity
        
        # Transform DatabricksNotebook to TridentNotebook if enabled
        if self._enable_databricks_to_trident and activity_type == "DatabricksNotebook":
            activity = self._transform_databricks_to_trident(activity)
        
        # Transform LinkedService references
        self._remove_linked_service_references_and_set_external_refs(activity)
        
        # Convert static text to expressions for Fabric compatibility
        self._convert_static_text_to_expressions(activity)
        
        # Add required properties for activity type
        self._add_required_properties(activity)
        
        # Transform dataset references
        self._transform_dataset_references(activity)
        
        return activity
    
    def _remove_linked_service_references_and_set_external_refs(
        self, 
        activity: Dict[str, Any]
    ) -> None:
        """Remove ADF LinkedService references and set Fabric externalReferences."""
        connection_id: Optional[str] = None
        linked_service_name: Optional[str] = None
        
        type_properties = activity.get("typeProperties", {})
        
        # Check various locations for LinkedService references
        if isinstance(type_properties.get("linkedServices"), list):
            linked_services = type_properties["linkedServices"]
            if linked_services and linked_services[0].get("referenceName"):
                linked_service_name = linked_services[0]["referenceName"]
                connection_id = self.map_linked_service_to_connection(linked_service_name)
                del type_properties["linkedServices"]
        
        if type_properties.get("linkedServiceName", {}).get("referenceName"):
            linked_service_name = type_properties["linkedServiceName"]["referenceName"]
            connection_id = self.map_linked_service_to_connection(linked_service_name)
            del type_properties["linkedServiceName"]
        
        if activity.get("linkedServiceName", {}).get("referenceName"):
            linked_service_name = activity["linkedServiceName"]["referenceName"]
            connection_id = self.map_linked_service_to_connection(linked_service_name)
            del activity["linkedServiceName"]
        
        if connection_id:
            if "externalReferences" not in activity:
                activity["externalReferences"] = {}
            activity["externalReferences"]["connection"] = connection_id
        elif linked_service_name:
            logger.warning(
                f"No connection mapping found for LinkedService: {linked_service_name} "
                f"in activity {activity.get('name')}"
            )
    
    def _convert_static_text_to_expressions(self, activity: Dict[str, Any]) -> None:
        """Convert static text properties to Expression objects for Fabric."""
        type_properties = activity.get("typeProperties", {})
        if not isinstance(type_properties, dict):
            return
        
        activity_type = activity.get("type", "")
        
        if activity_type == "Script":
            self._convert_script_expressions(type_properties)
        elif activity_type == "StoredProcedure":
            self._convert_stored_procedure_expressions(type_properties)
        elif activity_type == "WebActivity":
            self._convert_web_activity_expressions(type_properties)
        elif activity_type == "Lookup":
            self._convert_lookup_expressions(type_properties)
        else:
            self._convert_common_string_expressions(type_properties)
    
    def _transform_databricks_to_trident(self, activity: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transform DatabricksNotebook activity to TridentNotebook for Fabric.
        
        This transformation:
        - Changes type from "DatabricksNotebook" to "TridentNotebook"
        - Removes: linkedServiceName, notebookPath
        - Adds: notebookId and workspaceId inside typeProperties (placeholders)
        - Renames "baseParameters" to "parameters"
        - Uses double nesting structure for parameters:
          "param": { "value": { "value": "@expr", "type": "Expression" }, "type": "Expression" }
        
        Args:
            activity: The DatabricksNotebook activity definition.
            
        Returns:
            Transformed TridentNotebook activity definition.
        """
        transformed = copy.deepcopy(activity)
        
        # Change type
        transformed["type"] = "TridentNotebook"
        
        # Get typeProperties
        type_properties = transformed.get("typeProperties", {})
        
        # Remove notebookPath
        if "notebookPath" in type_properties:
            del type_properties["notebookPath"]
        
        # Remove linkedServiceName from activity and typeProperties
        if "linkedServiceName" in transformed:
            del transformed["linkedServiceName"]
        if "linkedServiceName" in type_properties:
            del type_properties["linkedServiceName"]
        
        # Add placeholders for notebookId and workspaceId
        type_properties["notebookId"] = "<PLACEHOLDER_NOTEBOOK_ID>"
        type_properties["workspaceId"] = "<PLACEHOLDER_WORKSPACE_ID>"
        
        # Transform baseParameters to parameters with double nesting
        if "baseParameters" in type_properties:
            base_params = type_properties["baseParameters"]
            new_params = {}
            
            if isinstance(base_params, dict):
                for param_name, param_value in base_params.items():
                    # Apply double nesting structure
                    new_params[param_name] = self._create_double_nested_expression(param_value)
            
            type_properties["parameters"] = new_params
            del type_properties["baseParameters"]
        
        transformed["typeProperties"] = type_properties
        
        logger.info(
            f"Transformed DatabricksNotebook '{activity.get('name')}' to TridentNotebook"
        )
        
        return transformed
    
    def _create_double_nested_expression(self, value: Any) -> Dict[str, Any]:
        """
        Create double nested expression structure for TridentNotebook parameters.
        
        Creates structure: { "value": { "value": "@expr", "type": "Expression" }, "type": "Expression" }
        
        Args:
            value: The original parameter value.
            
        Returns:
            Double nested expression structure.
        """
        # Determine the inner value
        if isinstance(value, dict):
            # If it's already an expression object, extract the value
            if value.get("type") == "Expression" and "value" in value:
                inner_value = value["value"]
            else:
                # Convert dict to string representation
                inner_value = json.dumps(value)
        else:
            inner_value = str(value) if value is not None else ""
        
        # Create double nested structure
        return {
            "value": {
                "value": inner_value,
                "type": "Expression"
            },
            "type": "Expression"
        }
    
    def _convert_script_expressions(self, type_properties: Dict[str, Any]) -> None:
        """Convert Script activity expressions."""
        scripts = type_properties.get("scripts", [])
        if isinstance(scripts, list):
            type_properties["scripts"] = [
                {**script, "text": {"value": script["text"], "type": "Expression"}}
                if isinstance(script.get("text"), str)
                else script
                for script in scripts
            ]
    
    def _convert_stored_procedure_expressions(self, type_properties: Dict[str, Any]) -> None:
        """Convert StoredProcedure activity expressions."""
        if isinstance(type_properties.get("storedProcedureName"), str):
            type_properties["storedProcedureName"] = {
                "value": type_properties["storedProcedureName"],
                "type": "Expression",
            }
        
        params = type_properties.get("storedProcedureParameters", {})
        if isinstance(params, dict):
            for param_name, param_value in params.items():
                if isinstance(param_value, str):
                    params[param_name] = {"value": param_value, "type": "Expression"}
    
    def _convert_web_activity_expressions(self, type_properties: Dict[str, Any]) -> None:
        """Convert WebActivity expressions."""
        if isinstance(type_properties.get("url"), str):
            type_properties["url"] = {"value": type_properties["url"], "type": "Expression"}
        
        if isinstance(type_properties.get("body"), str):
            type_properties["body"] = {"value": type_properties["body"], "type": "Expression"}
    
    def _convert_lookup_expressions(self, type_properties: Dict[str, Any]) -> None:
        """Convert Lookup activity expressions."""
        source = type_properties.get("source", {})
        if isinstance(source, dict) and isinstance(source.get("query"), str):
            source["query"] = {"value": source["query"], "type": "Expression"}
    
    def _convert_common_string_expressions(self, type_properties: Dict[str, Any]) -> None:
        """Convert common string properties to expressions."""
        common_props = ["query", "command", "script", "sql", "statement"]
        for prop in common_props:
            if isinstance(type_properties.get(prop), str):
                type_properties[prop] = {
                    "value": type_properties[prop], 
                    "type": "Expression"
                }
    
    def _add_required_properties(self, activity: Dict[str, Any]) -> None:
        """Add required properties for activity type."""
        type_properties = activity.get("typeProperties", {})
        if not isinstance(type_properties, dict):
            return
        
        activity_type = activity.get("type", "")
        
        if activity_type == "Script":
            if "scriptBlockExecutionTimeout" not in type_properties:
                type_properties["scriptBlockExecutionTimeout"] = "02:00:00"
        elif activity_type == "WebActivity":
            if "method" not in type_properties:
                type_properties["method"] = "GET"
            if "headers" not in type_properties:
                type_properties["headers"] = {}
        
        # Add common required properties
        if "policy" not in activity:
            activity["policy"] = {}
        if "timeout" not in activity["policy"]:
            activity["policy"]["timeout"] = "0.12:00:00"
    
    def _transform_dataset_references(self, activity: Dict[str, Any]) -> None:
        """Transform dataset references in activity."""
        if "inputs" in activity and isinstance(activity["inputs"], list):
            activity["inputs"] = self.transform_activity_inputs(activity["inputs"])
        
        if "outputs" in activity and isinstance(activity["outputs"], list):
            activity["outputs"] = self.transform_activity_outputs(activity["outputs"])
    
    def transform_activity_inputs(self, inputs: List[Any]) -> List[Any]:
        """Transform activity inputs (datasets)."""
        if not isinstance(inputs, list):
            return inputs
        
        return [
            self._transform_dataset_reference(inp, "source")
            for inp in inputs
        ]
    
    def transform_activity_outputs(self, outputs: List[Any]) -> List[Any]:
        """Transform activity outputs (datasets)."""
        if not isinstance(outputs, list):
            return outputs
        
        return [
            self._transform_dataset_reference(out, "sink")
            for out in outputs
        ]
    
    def _transform_dataset_reference(
        self, 
        dataset_ref: Any, 
        role: str
    ) -> Any:
        """Transform a single dataset reference."""
        if not isinstance(dataset_ref, dict):
            return dataset_ref
        
        # Handle DatasetReference type
        if dataset_ref.get("type") == "DatasetReference":
            ref_name = dataset_ref.get("referenceName") or dataset_ref.get("dataset", {}).get("referenceName")
            if ref_name:
                return {
                    **dataset_ref,
                    "type": "DatasetReference",
                    "referenceName": ref_name,
                }
        
        return dataset_ref
    
    def activity_references_failed_connector(self, activity: Dict[str, Any]) -> bool:
        """
        Check if an activity references a failed connector.
        
        Args:
            activity: The activity definition.
            
        Returns:
            True if the activity references a failed connector.
        """
        if not activity or not isinstance(activity, dict):
            return False
        
        type_properties = activity.get("typeProperties", {})
        
        # Check dataset references
        datasets = [
            type_properties.get("dataset"),
            type_properties.get("source", {}).get("dataset") if isinstance(type_properties.get("source"), dict) else None,
            type_properties.get("sink", {}).get("dataset") if isinstance(type_properties.get("sink"), dict) else None,
        ]
        datasets.extend(type_properties.get("datasets", []) or [])
        
        for dataset in datasets:
            if isinstance(dataset, dict):
                ls_name = dataset.get("linkedServiceName", {}).get("referenceName")
                if ls_name and ls_name in self._failed_connectors:
                    return True
        
        # Check LinkedService references
        linked_services = [
            type_properties.get("linkedServiceName"),
            type_properties.get("linkedService"),
        ]
        linked_services.extend(type_properties.get("linkedServices", []) or [])
        
        for ls in linked_services:
            if isinstance(ls, dict):
                ref_name = ls.get("referenceName")
            elif isinstance(ls, str):
                ref_name = ls
            else:
                continue
            
            if ref_name and ref_name in self._failed_connectors:
                return True
        
        return False
    
    def count_inactive_activities(self, activities: List[Any]) -> int:
        """Count the number of inactive activities."""
        return sum(
            1 for a in activities 
            if isinstance(a, dict) and a.get("state") == "Inactive"
        )
    
    def has_linked_service_references(self, activity: Dict[str, Any]) -> bool:
        """Check if an activity has LinkedService references."""
        if not isinstance(activity, dict):
            return False
        
        # Check inputs/outputs
        has_input_datasets = any(
            isinstance(inp, dict) and inp.get("type") == "DatasetReference"
            for inp in activity.get("inputs", [])
        )
        has_output_datasets = any(
            isinstance(out, dict) and out.get("type") == "DatasetReference"
            for out in activity.get("outputs", [])
        )
        
        # Check direct references
        type_properties = activity.get("typeProperties", {})
        has_direct_refs = any([
            type_properties.get("linkedServiceName"),
            type_properties.get("linkedService"),
            type_properties.get("source", {}).get("linkedServiceName") if isinstance(type_properties.get("source"), dict) else None,
            type_properties.get("sink", {}).get("linkedServiceName") if isinstance(type_properties.get("sink"), dict) else None,
        ])
        
        return has_input_datasets or has_output_datasets or has_direct_refs


# Singleton instance for convenience
activity_transformer = ActivityTransformer()
