"""
Test script to demonstrate improved DAX query error handling.
This script shows the different types of errors that can be returned by execute_dax_query.
"""

import sys
import os

# Add the parent directory to sys.path to import server module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_error_scenarios():
    """Test various error scenarios with the improved execute_dax_query function."""
    
    # Mock the execute_dax_query function for testing (since we can't actually connect)
    def mock_execute_dax_query(workspace_name, dataset_name, dax_query, dataset_id=None):
        """Mock version that simulates different error conditions."""
        
        # Parameter validation errors
        if not workspace_name or not workspace_name.strip():
            return [{"error": "Workspace name is required and cannot be empty.", "error_type": "parameter_error"}]
        
        if not dataset_name or not dataset_name.strip():
            return [{"error": "Dataset name is required and cannot be empty.", "error_type": "parameter_error"}]
        
        if not dax_query or not dax_query.strip():
            return [{"error": "DAX query is required and cannot be empty.", "error_type": "parameter_error"}]
        
        # Simulate different error conditions based on input
        if workspace_name == "invalid_workspace":
            return [{"error": "Workspace or dataset not found: The workspace 'invalid_workspace' was not found. Please verify workspace name 'invalid_workspace' and dataset name 'test_dataset' are correct.", "error_type": "not_found_error"}]
        
        if "SYNTAX ERROR" in dax_query:
            return [{"error": "DAX query syntax error: Invalid syntax near 'ERROR'. Please check your DAX query syntax.", "error_type": "dax_syntax_error", "query": dax_query}]
        
        if workspace_name == "no_permission":
            return [{"error": "Permission denied: Access denied to workspace. You may not have sufficient permissions to query this dataset.", "error_type": "permission_error"}]
        
        # Successful case
        return [{"Column1": "Value1", "Column2": 123}, {"Column1": "Value2", "Column2": 456}]
    
    print("Testing DAX Query Error Handling")
    print("=" * 50)
    
    # Test 1: Empty workspace name
    print("\n1. Testing empty workspace name:")
    result = mock_execute_dax_query("", "test_dataset", "EVALUATE ROW(\"Test\", 1)")
    print(f"Result: {result}")
    
    # Test 2: Empty dataset name
    print("\n2. Testing empty dataset name:")
    result = mock_execute_dax_query("test_workspace", "", "EVALUATE ROW(\"Test\", 1)")
    print(f"Result: {result}")
    
    # Test 3: Empty DAX query
    print("\n3. Testing empty DAX query:")
    result = mock_execute_dax_query("test_workspace", "test_dataset", "")
    print(f"Result: {result}")
    
    # Test 4: Invalid workspace
    print("\n4. Testing invalid workspace:")
    result = mock_execute_dax_query("invalid_workspace", "test_dataset", "EVALUATE ROW(\"Test\", 1)")
    print(f"Result: {result}")
    
    # Test 5: DAX syntax error
    print("\n5. Testing DAX syntax error:")
    result = mock_execute_dax_query("test_workspace", "test_dataset", "EVALUATE SYNTAX ERROR")
    print(f"Result: {result}")
    
    # Test 6: Permission error
    print("\n6. Testing permission error:")
    result = mock_execute_dax_query("no_permission", "test_dataset", "EVALUATE ROW(\"Test\", 1)")
    print(f"Result: {result}")
    
    # Test 7: Successful query
    print("\n7. Testing successful query:")
    result = mock_execute_dax_query("test_workspace", "test_dataset", "EVALUATE ROW(\"Test\", 1)")
    print(f"Result: {result}")
    
    print("\n" + "=" * 50)
    print("Key improvements in error handling:")
    print("- Structured error objects with error_type classification")
    print("- Detailed error messages with actionable guidance")
    print("- Proper parameter validation before attempting connection")
    print("- Consistent return type (always list[dict])")
    print("- Proper connection cleanup in finally block")
    print("- Better error categorization (authentication, permission, syntax, etc.)")

if __name__ == "__main__":
    test_error_scenarios()
