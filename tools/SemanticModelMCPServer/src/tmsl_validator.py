"""
TMSL Validation Helper Module

This module contains validation functions for TMSL (Tabular Model Scripting Language) definitions,
specifically for DirectLake models. It provides comprehensive validation to prevent common
deployment failures and structural issues.

Functions:
- validate_tmsl_structure: Main validation function for complete TMSL definitions
- validate_single_table_tmsl: Specialized validation for single table updates
"""

import json
from typing import Dict, Any


def validate_tmsl_structure(tmsl_definition: str) -> Dict[str, Any]:
    """Validates TMSL structure for common DirectLake mistakes and required components.
    
    Args:
        tmsl_definition: JSON string containing the TMSL definition
    
    Returns:
        dict: {
            "valid": bool,
            "error": str,
            "suggestions": str,
            "summary": str,
            "warnings": str
        }
    """
    try:
        tmsl = json.loads(tmsl_definition)
    except json.JSONDecodeError as e:
        return {
            "valid": False,
            "error": f"Invalid JSON syntax: {e}",
            "suggestions": "Fix JSON syntax errors. Use a JSON validator to check your TMSL structure.",
            "summary": "JSON validation failed",
            "warnings": ""
        }
    
    errors = []
    warnings = []
    suggestions = []
    
    # Check for createOrReplace wrapper or extract model content
    model_content = tmsl
    if "createOrReplace" in tmsl:
        if "database" in tmsl["createOrReplace"]:
            model_content = tmsl["createOrReplace"]["database"]
        elif "table" in tmsl["createOrReplace"]:
            # Single table update - different validation
            return validate_single_table_tmsl(tmsl)
    
    # Validate DirectLake specific requirements
    if "model" in model_content:
        model = model_content["model"]
        
        # 🚨 CRITICAL CHECK #1: Expressions block for DirectLake
        if "expressions" not in model:
            errors.append("❌ CRITICAL: Missing 'expressions' block - DirectLake models require DatabaseQuery expression")
            suggestions.append("Add expressions block with DatabaseQuery using Sql.Database() function")
        else:
            # Validate expressions content
            expressions = model["expressions"]
            database_query_found = False
            for expr in expressions:
                if expr.get("name") == "DatabaseQuery" and expr.get("kind") == "m":
                    database_query_found = True
                    # Check if expression contains Sql.Database
                    expression_content = expr.get("expression", "")
                    if isinstance(expression_content, list):
                        expression_content = " ".join(expression_content)
                    elif isinstance(expression_content, str):
                        # Handle string expressions as well
                        pass
                    else:
                        expression_content = str(expression_content)
                    
                    if "Sql.Database" not in expression_content:
                        warnings.append("⚠️ DatabaseQuery expression doesn't contain Sql.Database() function")
                        suggestions.append("Ensure DatabaseQuery uses Sql.Database(server, endpoint_id) format")
            
            if not database_query_found:
                errors.append("❌ CRITICAL: DatabaseQuery expression not found in expressions block")
                suggestions.append("Add DatabaseQuery expression with kind='m' and Sql.Database() function")
        
        # 🚨 CRITICAL CHECK #2: Table validation
        if "tables" in model:
            tables = model["tables"]
            for table in tables:
                table_name = table.get("name", "unnamed_table")
                
                # Check for INVALID table-level mode property
                if "mode" in table:
                    errors.append(f"❌ CRITICAL ERROR: Table '{table_name}' has 'mode' property at table level - THIS BREAKS DEPLOYMENT!")
                    suggestions.append(f"REMOVE 'mode' from table '{table_name}' - mode belongs in partitions only!")
                
                # Check for INVALID table-level defaultMode property
                if "defaultMode" in table:
                    errors.append(f"❌ CRITICAL ERROR: Table '{table_name}' has 'defaultMode' property - INVALID for DirectLake!")
                    suggestions.append(f"REMOVE 'defaultMode' from table '{table_name}'")
                
                # 🚨 CRITICAL CHECK #3: Partitions requirement
                if "partitions" not in table:
                    errors.append(f"❌ CRITICAL: Table '{table_name}' missing 'partitions' array")
                    suggestions.append(f"Add partitions array to table '{table_name}' with DirectLake partition")
                else:
                    partitions = table["partitions"]
                    directlake_partition_found = False
                    for partition in partitions:
                        if partition.get("mode") == "directLake":
                            directlake_partition_found = True
                            # Validate partition structure
                            if "source" not in partition:
                                errors.append(f"❌ Partition in table '{table_name}' missing 'source' property")
                                suggestions.append(f"Add source property to DirectLake partition in table '{table_name}'")
                            else:
                                source = partition["source"]
                                if source.get("expressionSource") != "DatabaseQuery":
                                    warnings.append(f"⚠️ Partition in table '{table_name}' should use expressionSource='DatabaseQuery'")
                                    suggestions.append(f"Set expressionSource to 'DatabaseQuery' in table '{table_name}' partition")
                                
                                # Check for schema name in DirectLake partition source
                                if "schemaName" not in source:
                                    warnings.append(f"⚠️ DirectLake partition in table '{table_name}' missing 'schemaName' - may cause connection issues")
                                    suggestions.append(f"Add 'schemaName' property to DirectLake partition source in table '{table_name}' (e.g., 'dbo', 'gold')")
                                
                                # Check entity name exists
                                if "entityName" not in source:
                                    errors.append(f"❌ DirectLake partition in table '{table_name}' missing 'entityName'")
                                    suggestions.append(f"Add 'entityName' property to DirectLake partition source in table '{table_name}'")
                    
                    if not directlake_partition_found:
                        errors.append(f"❌ CRITICAL: Table '{table_name}' has no DirectLake partition")
                        suggestions.append(f"Add partition with mode='directLake' to table '{table_name}'")
    
    # Determine validation result
    is_valid = len(errors) == 0
    
    # Build summary
    summary_parts = []
    if len(errors) == 0:
        summary_parts.append("✅ No critical errors found")
    else:
        summary_parts.append(f"❌ {len(errors)} critical errors detected")
    
    if len(warnings) > 0:
        summary_parts.append(f"⚠️ {len(warnings)} warnings")
    
    return {
        "valid": is_valid,
        "error": "\n".join(errors) if errors else "",
        "suggestions": "\n".join(suggestions) if suggestions else "TMSL structure looks good!",
        "summary": " | ".join(summary_parts),
        "warnings": "\n".join(warnings) if warnings else ""
    }


def validate_single_table_tmsl(tmsl: Dict[str, Any]) -> Dict[str, Any]:
    """Validates TMSL for single table updates.
    
    Args:
        tmsl: Parsed TMSL dictionary for single table operations
    
    Returns:
        dict: Validation result with same structure as validate_tmsl_structure
    """
    table_content = tmsl.get("createOrReplace", {}).get("table", {})
    table_name = table_content.get("name", "unnamed_table")
    
    errors = []
    suggestions = []
    warnings = []
    
    # Check for invalid table-level mode
    if "mode" in table_content:
        errors.append(f"❌ CRITICAL: Table '{table_name}' has 'mode' at table level - INVALID!")
        suggestions.append("REMOVE 'mode' from table - mode belongs in partitions only!")
    
    # Check for invalid table-level defaultMode
    if "defaultMode" in table_content:
        errors.append(f"❌ CRITICAL: Table '{table_name}' has 'defaultMode' property - INVALID for DirectLake!")
        suggestions.append(f"REMOVE 'defaultMode' from table '{table_name}'")
    
    # Check for partitions
    if "partitions" not in table_content:
        errors.append(f"❌ Table '{table_name}' missing partitions array")
        suggestions.append("Add partitions array with DirectLake partition")
    else:
        # Validate partition structure
        partitions = table_content["partitions"]
        directlake_partition_found = False
        for partition in partitions:
            if partition.get("mode") == "directLake":
                directlake_partition_found = True
                # Validate partition structure
                if "source" not in partition:
                    errors.append(f"❌ Partition in table '{table_name}' missing 'source' property")
                    suggestions.append(f"Add source property to DirectLake partition in table '{table_name}'")
                else:
                    source = partition["source"]
                    if source.get("expressionSource") != "DatabaseQuery":
                        warnings.append(f"⚠️ Partition in table '{table_name}' should use expressionSource='DatabaseQuery'")
                        suggestions.append(f"Set expressionSource to 'DatabaseQuery' in table '{table_name}' partition")
                    
                    # Check for schema name in DirectLake partition source
                    if "schemaName" not in source:
                        warnings.append(f"⚠️ DirectLake partition in table '{table_name}' missing 'schemaName' - may cause connection issues")
                        suggestions.append(f"Add 'schemaName' property to DirectLake partition source in table '{table_name}' (e.g., 'dbo', 'gold')")
                    
                    # Check entity name exists
                    if "entityName" not in source:
                        errors.append(f"❌ DirectLake partition in table '{table_name}' missing 'entityName'")
                        suggestions.append(f"Add 'entityName' property to DirectLake partition source in table '{table_name}'")
            elif "mode" not in partition:
                suggestions.append(f"Add 'mode': 'directLake' to partition in table '{table_name}'")
        
        if not directlake_partition_found:
            errors.append(f"❌ CRITICAL: Table '{table_name}' has no DirectLake partition")
            suggestions.append(f"Add partition with mode='directLake' to table '{table_name}'")
    
    return {
        "valid": len(errors) == 0,
        "error": "\n".join(errors),
        "suggestions": "\n".join(suggestions) if suggestions else "Single table TMSL structure looks good!",
        "summary": f"Single table '{table_name}' validation",
        "warnings": "\n".join(warnings) if warnings else ""
    }
