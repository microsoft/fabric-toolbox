# DAX Query Error Handling Improvements

## Overview
The `execute_dax_query` function has been enhanced with comprehensive error handling to provide clear, actionable error messages and maintain consistent return types.

## Key Improvements

### 1. Consistent Return Type
- **Before**: Mixed return types (string errors vs list of dictionaries)
- **After**: Always returns `list[dict]`, with errors as structured objects

### 2. Structured Error Objects
All errors now return as dictionary objects with:
```python
{
    "error": "Detailed error message with actionable guidance",
    "error_type": "category_of_error",
    "query": "original_query_if_relevant"  # Optional
}
```

### 3. Error Categories

#### Parameter Errors (`parameter_error`)
- Empty or missing workspace name
- Empty or missing dataset name  
- Empty or missing DAX query

#### Authentication Errors (`authentication_error`)
- No valid access token available
- Token expired or invalid
- Login failures

#### Permission Errors (`permission_error`)
- Insufficient permissions to access workspace
- No query permissions on dataset
- Access denied to specific resources

#### Not Found Errors (`not_found_error`)
- Workspace doesn't exist
- Dataset doesn't exist in workspace
- Invalid workspace or dataset names

#### DAX Syntax Errors (`dax_syntax_error`)
- Invalid DAX syntax
- Parse errors in DAX query
- Malformed DAX expressions

#### Connection Errors (`connection_error`)
- Network connectivity issues
- Service unavailable
- Connection timeout during establishment

#### Timeout Errors (`timeout_error`)
- Query execution timeout
- Long-running query exceeded limits

#### Assembly/Import Errors (`assembly_load_error`, `import_error`)
- Missing .NET assemblies
- Failed to load required libraries
- Import failures for ADOMD components

#### General Errors (`general_error`)
- Unexpected errors not fitting other categories
- System-level exceptions

### 4. Proper Resource Management
- Connection objects are properly closed in `finally` blocks
- Reader objects are explicitly closed after use
- Cleanup errors don't mask main errors

### 5. Enhanced Data Type Handling
- Null values properly handled
- DateTime objects converted to ISO format
- Better handling of different data types in query results

## Usage Examples

### Successful Query
```python
result = execute_dax_query("MyWorkspace", "MyDataset", "EVALUATE ROW(\"Test\", 1)")
# Returns: [{"Test": 1}]
```

### Parameter Error
```python
result = execute_dax_query("", "MyDataset", "EVALUATE ROW(\"Test\", 1)")
# Returns: [{"error": "Workspace name is required and cannot be empty.", "error_type": "parameter_error"}]
```

### Authentication Error
```python
# When no valid token available
result = execute_dax_query("MyWorkspace", "MyDataset", "EVALUATE ROW(\"Test\", 1)")
# Returns: [{"error": "No valid access token available. Please check authentication.", "error_type": "authentication_error"}]
```

### DAX Syntax Error
```python
result = execute_dax_query("MyWorkspace", "MyDataset", "INVALID DAX SYNTAX")
# Returns: [{"error": "DAX query syntax error: Invalid syntax near 'SYNTAX'. Please check your DAX query syntax.", "error_type": "dax_syntax_error", "query": "INVALID DAX SYNTAX"}]
```

### Not Found Error
```python
result = execute_dax_query("NonExistentWorkspace", "MyDataset", "EVALUATE ROW(\"Test\", 1)")
# Returns: [{"error": "Workspace or dataset not found: ... Please verify workspace name 'NonExistentWorkspace' and dataset name 'MyDataset' are correct.", "error_type": "not_found_error"}]
```

## Error Handling Best Practices

### 1. Check for Errors
```python
result = execute_dax_query(workspace, dataset, query)
if result and "error" in result[0]:
    error_info = result[0]
    print(f"Error ({error_info['error_type']}): {error_info['error']}")
    return
```

### 2. Handle Different Error Types
```python
result = execute_dax_query(workspace, dataset, query)
if result and "error" in result[0]:
    error_type = result[0]["error_type"]
    
    if error_type == "authentication_error":
        # Refresh token or re-authenticate
        pass
    elif error_type == "dax_syntax_error":
        # Show syntax help or validation
        pass
    elif error_type == "permission_error":
        # Request additional permissions
        pass
    # ... handle other error types
```

### 3. Validate Parameters Before Calling
```python
if not workspace_name or not workspace_name.strip():
    print("Workspace name is required")
    return

if not dataset_name or not dataset_name.strip():
    print("Dataset name is required") 
    return

if not dax_query or not dax_query.strip():
    print("DAX query is required")
    return

result = execute_dax_query(workspace_name, dataset_name, dax_query)
```

## Migration Notes

### Breaking Changes
- Error messages are now returned as structured objects in a list instead of plain strings
- Function always returns `list[dict]` instead of mixed types

### Code Updates Required
**Before:**
```python
result = execute_dax_query(workspace, dataset, query)
if isinstance(result, str) and result.startswith("Error"):
    print(f"Error: {result}")
    return
```

**After:**
```python
result = execute_dax_query(workspace, dataset, query)
if result and "error" in result[0]:
    print(f"Error: {result[0]['error']}")
    return
```
