"""
Global Parameter Expression Transformer.

This module transforms ADF global parameter expressions to Fabric Variable Library
expressions, enabling seamless migration of pipelines that use global parameters.
"""

import json
import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class GlobalParameterExpressionTransformer:
    """
    Transforms global parameter expressions from ADF to Fabric Variable Library format.
    
    Handles three expression patterns:
    1. Standard: @pipeline().globalParameters.paramName
    2. Curly-brace: @{pipeline().globalParameters.paramName}
    3. Function-wrapped: @concat(pipeline().globalParameters.paramName, 'suffix')
    
    Transforms to: @variableLibrary('LibraryName').paramName
    
    Example:
        >>> transformer = GlobalParameterExpressionTransformer()
        >>> pipeline = transformer.transform_pipeline_expressions(pipeline_def, "MyFactory_GlobalParameters")
        >>> # All global parameter expressions are now using Variable Library
    """
    
    def __init__(self):
        """Initialize the expression transformer."""
        # Regex patterns for detecting different global parameter expression styles
        self._patterns = {
            # Standard: @pipeline().globalParameters.paramName
            "standard": re.compile(r"@pipeline\(\)\.globalParameters\.(\w+)"),
            
            # Curly-brace wrapped: @{pipeline().globalParameters.paramName}
            "curly": re.compile(r"@\{pipeline\(\)\.globalParameters\.(\w+)\}"),
            
            # Function-wrapped: concat(pipeline().globalParameters.paramName, ...)
            "nested": re.compile(r"pipeline\(\)\.globalParameters\.(\w+)")
        }
    
    def transform_pipeline_expressions(
        self,
        pipeline_def: Dict[str, Any],
        variable_library_name: str
    ) -> Dict[str, Any]:
        """
        Transform all global parameter expressions in a pipeline definition.
        
        Args:
            pipeline_def: The ADF pipeline definition to transform
            variable_library_name: Name of the Fabric Variable Library
            
        Returns:
            Transformed pipeline definition with Variable Library expressions
        """
        # Convert to JSON string for easier regex replacement
        pipeline_json = json.dumps(pipeline_def)
        
        # Track transformations for logging
        transformations = []
        
        # Pattern 1: Standard @pipeline().globalParameters.paramName
        # Transform to: @variableLibrary('LibraryName').paramName
        def replace_standard(match):
            param_name = match.group(1)
            transformation = (
                match.group(0),
                f"@variableLibrary('{variable_library_name}').{param_name}"
            )
            transformations.append(transformation)
            return transformation[1]
        
        pipeline_json = self._patterns["standard"].sub(replace_standard, pipeline_json)
        
        # Pattern 2: Curly-brace @{pipeline().globalParameters.paramName}
        # Transform to: @{variableLibrary('LibraryName').paramName}
        def replace_curly(match):
            param_name = match.group(1)
            transformation = (
                match.group(0),
                f"@{{variableLibrary('{variable_library_name}').{param_name}}}"
            )
            transformations.append(transformation)
            return transformation[1]
        
        pipeline_json = self._patterns["curly"].sub(replace_curly, pipeline_json)
        
        # Pattern 3: Nested function calls like concat(pipeline().globalParameters.paramName, 'suffix')
        # Transform to: concat(variableLibrary('LibraryName').paramName, 'suffix')
        # This is trickier as we need to preserve the @ prefix and not double-transform
        def replace_nested(match):
            param_name = match.group(1)
            # Only replace if not already transformed (check if preceded by @)
            full_match = match.group(0)
            if "@pipeline().globalParameters" in full_match:
                transformation = (
                    full_match,
                    f"variableLibrary('{variable_library_name}').{param_name}"
                )
                transformations.append(transformation)
                return transformation[1]
            return full_match
        
        # For nested patterns, we need to be more careful to avoid double transformation
        # Only replace if it's part of a function call (not already handled by standard/curly)
        nested_only_pattern = re.compile(
            r"(?<!@)(?<!@\{)pipeline\(\)\.globalParameters\.(\w+)"
        )
        pipeline_json = nested_only_pattern.sub(replace_nested, pipeline_json)
        
        # Log transformations
        if transformations:
            logger.info(f"Transformed {len(transformations)} global parameter expressions:")
            for old_expr, new_expr in transformations[:5]:  # Show first 5
                logger.info(f"  {old_expr} → {new_expr}")
            if len(transformations) > 5:
                logger.info(f"  ... and {len(transformations) - 5} more")
        
        # Convert back to dictionary
        transformed_pipeline = json.loads(pipeline_json)
        
        return transformed_pipeline
    
    def detect_global_parameter_usage(self, pipeline_def: Dict[str, Any]) -> List[str]:
        """
        Detect which global parameters are used in a pipeline.
        
        Args:
            pipeline_def: The pipeline definition to scan
            
        Returns:
            List of unique global parameter names used
        """
        pipeline_json = json.dumps(pipeline_def)
        param_names = set()
        
        # Check all patterns
        for pattern_name, pattern in self._patterns.items():
            matches = pattern.findall(pipeline_json)
            param_names.update(matches)
        
        return sorted(list(param_names))
    
    def validate_transformation(
        self,
        original_pipeline: Dict[str, Any],
        transformed_pipeline: Dict[str, Any],
        variable_library_name: str
    ) -> Dict[str, Any]:
        """
        Validate that global parameter transformation was successful.
        
        Args:
            original_pipeline: Original ADF pipeline definition
            transformed_pipeline: Transformed pipeline definition
            variable_library_name: Expected Variable Library name
            
        Returns:
            Validation result with success flag and details
        """
        original_json = json.dumps(original_pipeline)
        transformed_json = json.dumps(transformed_pipeline)
        
        # Check that no old-style expressions remain
        remaining_old_style = []
        for pattern_name, pattern in self._patterns.items():
            matches = pattern.findall(transformed_json)
            if matches:
                remaining_old_style.extend(matches)
        
        # Check that Variable Library expressions were added
        var_lib_pattern = re.compile(rf"variableLibrary\('{variable_library_name}'\)")
        new_expressions = var_lib_pattern.findall(transformed_json)
        
        success = len(remaining_old_style) == 0 and len(new_expressions) > 0
        
        return {
            "success": success,
            "remaining_old_expressions": len(remaining_old_style),
            "new_variable_library_references": len(new_expressions),
            "variable_library_name": variable_library_name,
            "details": {
                "old_style_params": remaining_old_style[:5] if remaining_old_style else [],
                "new_expression_count": len(new_expressions)
            }
        }
