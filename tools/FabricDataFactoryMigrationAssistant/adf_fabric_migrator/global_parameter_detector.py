"""
Global Parameter Detection Service.

This module scans ADF components (pipelines) to detect global parameter
references and extract metadata for migration to Fabric Variable Libraries.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

from .models import ADFComponent, ComponentType, GlobalParameterReference

logger = logging.getLogger(__name__)


# Data type mapping from ADF to Fabric
ADF_TO_FABRIC_TYPE_MAP = {
    "String": "String",
    "Int": "Integer",
    "Float": "Number",
    "Bool": "Boolean",
    "Array": "String",  # Complex types become String in Fabric
    "Object": "String",
    "SecureString": "String",
}


class GlobalParameterDetector:
    """
    Service for detecting global parameter references in ADF pipelines.
    
    This class scans pipeline definitions for @pipeline().globalParameters
    expressions and extracts metadata for migration to Fabric Variable Libraries.
    
    Example:
        >>> detector = GlobalParameterDetector()
        >>> refs = detector.detect_global_parameters(components)
        >>> print(f"Found {len(refs)} global parameters")
    """
    
    def __init__(self):
        """Initialize the global parameter detector."""
        # Regex patterns for detecting global parameter references
        self._primary_pattern = re.compile(r"@pipeline\(\)\.globalParameters\.(\w+)")
        self._alternative_pattern = re.compile(r"@\{pipeline\(\)\.globalParameters\.(\w+)\}")
        self._nested_pattern = re.compile(r"pipeline\(\)\.globalParameters\.(\w+)")
    
    def detect_global_parameters(
        self, 
        components: List[ADFComponent]
    ) -> List[GlobalParameterReference]:
        """
        Scan all pipelines for global parameter references.
        
        Args:
            components: All ADF components from uploaded ARM template.
            
        Returns:
            Array of detected global parameter references with metadata.
        """
        logger.info("Starting global parameter detection...")
        
        pipelines = [c for c in components if c.type == ComponentType.PIPELINE]
        logger.info(f"Found {len(pipelines)} pipelines to scan")
        
        references_map: Dict[str, GlobalParameterReference] = {}
        
        for pipeline in pipelines:
            pipeline_refs = self._scan_pipeline_for_references(pipeline)
            
            for param_name in pipeline_refs:
                if param_name not in references_map:
                    references_map[param_name] = self._create_reference_stub(param_name)
                
                ref = references_map[param_name]
                if pipeline.name not in ref.referenced_by_pipelines:
                    ref.referenced_by_pipelines.append(pipeline.name)
        
        detected_refs = list(references_map.values())
        logger.info(f"Detected {len(detected_refs)} unique global parameters")
        
        return detected_refs
    
    def _scan_pipeline_for_references(self, pipeline: ADFComponent) -> List[str]:
        """
        Scan a single pipeline's content for global parameter references.
        
        Args:
            pipeline: The pipeline component to scan.
            
        Returns:
            Array of unique parameter names found in this pipeline.
        """
        param_names: set = set()
        
        # Convert pipeline definition to JSON string for regex scanning
        pipeline_json = json.dumps(pipeline.definition)
        
        # Scan with primary pattern
        for match in self._primary_pattern.finditer(pipeline_json):
            param_names.add(match.group(1))
        
        # Scan with alternative pattern
        for match in self._alternative_pattern.finditer(pipeline_json):
            param_names.add(match.group(1))
        
        # Scan with nested pattern
        for match in self._nested_pattern.finditer(pipeline_json):
            param_names.add(match.group(1))
        
        if param_names:
            logger.info(f'Pipeline "{pipeline.name}" references: {", ".join(param_names)}')
        
        return list(param_names)
    
    def _create_reference_stub(self, name: str) -> GlobalParameterReference:
        """
        Create a default GlobalParameterReference stub.
        
        Args:
            name: The parameter name.
            
        Returns:
            Default reference object with placeholder values.
        """
        return GlobalParameterReference(
            name=name,
            adf_data_type="String",
            fabric_data_type="String",
            default_value="",
            referenced_by_pipelines=[],
            is_secure=False,
            note="Detected from pipeline expressions. Please configure type and value.",
        )
    
    def detect_from_arm_template(self, arm_template: Dict[str, Any]) -> List[GlobalParameterReference]:
        """
        Extract global parameters from ARM template globalParameters section.
        
        This is a fallback/supplemental detection method that reads parameters
        directly from the factory definition.
        
        Args:
            arm_template: The full ARM template object.
            
        Returns:
            Array of global parameter references from template definition.
        """
        logger.info("Attempting ARM template fallback detection...")
        
        references: List[GlobalParameterReference] = []
        
        try:
            resources = arm_template.get("resources", [])
            factories = [
                r for r in resources 
                if isinstance(r, dict) and r.get("type") == "Microsoft.DataFactory/factories"
            ]
            
            for factory in factories:
                global_params = factory.get("properties", {}).get("globalParameters", {})
                
                if isinstance(global_params, dict):
                    for param_name, param_def in global_params.items():
                        if not isinstance(param_def, dict):
                            continue
                            
                        adf_type = param_def.get("type", "String")
                        fabric_type = self._map_adf_type_to_fabric(adf_type)
                        
                        references.append(GlobalParameterReference(
                            name=param_name,
                            adf_data_type=adf_type,
                            fabric_data_type=fabric_type,
                            default_value=param_def.get("value", ""),
                            referenced_by_pipelines=[],
                            is_secure=adf_type == "SecureString",
                            note="Detected from ARM template globalParameters definition",
                        ))
            
            logger.info(f"ARM fallback detected {len(references)} parameters")
            
        except Exception as e:
            logger.error(f"Error parsing ARM template: {e}")
        
        return references
    
    def _map_adf_type_to_fabric(self, adf_type: str) -> str:
        """
        Map ADF data type to Fabric Variable Library type.
        
        Args:
            adf_type: The ADF type (String, Int, Float, Bool, etc.)
            
        Returns:
            Corresponding Fabric type (String, Integer, Number, Boolean).
        """
        return ADF_TO_FABRIC_TYPE_MAP.get(adf_type, "String")
    
    def detect_with_fallback(
        self, 
        components: List[ADFComponent],
        arm_template: Dict[str, Any]
    ) -> List[GlobalParameterReference]:
        """
        Combined detection strategy using both expression scanning and ARM template.
        
        This method merges results from both detection methods, preferring
        ARM template metadata when available while keeping pipeline references
        from expression scanning.
        
        Args:
            components: Pipeline components.
            arm_template: Full ARM template.
            
        Returns:
            Comprehensive list of global parameters.
        """
        # Step 1: Expression-based detection (primary)
        expression_refs = self.detect_global_parameters(components)
        
        # Step 2: ARM template detection (fallback/supplemental)
        arm_refs = self.detect_from_arm_template(arm_template)
        
        # Step 3: Merge results
        merged_map: Dict[str, GlobalParameterReference] = {}
        
        # Add ARM template refs first (they have better metadata)
        for ref in arm_refs:
            merged_map[ref.name] = ref
        
        # Merge expression refs, preserving referenced_by_pipelines
        for ref in expression_refs:
            if ref.name in merged_map:
                # Update pipeline references in ARM-detected param
                existing = merged_map[ref.name]
                existing.referenced_by_pipelines = ref.referenced_by_pipelines
            else:
                # Add expression-only detected param
                merged_map[ref.name] = ref
        
        merged = list(merged_map.values())
        logger.info(f"Final merged result: {len(merged)} parameters")
        
        return merged
    
    def extract_factory_name(self, arm_template: Dict[str, Any]) -> str:
        """
        Extract factory name from ARM template for default library naming.
        
        Args:
            arm_template: Full ARM template.
            
        Returns:
            Factory name or 'DataFactory' as fallback.
        """
        try:
            resources = arm_template.get("resources", [])
            factories = [
                r for r in resources
                if isinstance(r, dict) and r.get("type") == "Microsoft.DataFactory/factories"
            ]
            
            if factories:
                factory_name = factories[0].get("name", "")
                
                if isinstance(factory_name, str):
                    # Handle "[parameters('factoryName')]" pattern
                    match = re.search(r"parameters\('(.+?)'\)", factory_name)
                    if match:
                        param_name = match.group(1)
                        param_value = (
                            arm_template.get("parameters", {})
                            .get(param_name, {})
                            .get("defaultValue")
                        )
                        if param_value:
                            return param_value
                    return factory_name
                    
        except Exception as e:
            logger.error(f"Error extracting factory name: {e}")
        
        return "DataFactory"
    
    def get_variable_library_name(
        self, 
        arm_template: Dict[str, Any],
        suffix: str = "GlobalParameters"
    ) -> str:
        """
        Generate suggested Variable Library name based on factory name.
        
        Args:
            arm_template: Full ARM template.
            suffix: Suffix to append to factory name.
            
        Returns:
            Suggested Variable Library display name.
        """
        factory_name = self.extract_factory_name(arm_template)
        return f"{factory_name}_{suffix}"


# Singleton instance for convenience
global_parameter_detector = GlobalParameterDetector()
