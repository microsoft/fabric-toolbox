"""
Test the DAX-based local Power BI Desktop exploration.
"""

import os
import sys

# Add the project root to the path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from tools.dax_local_explorer import explore_local_powerbi_model_dax
import json

def test_dax_based_exploration():
    """Test the DAX-based exploration approach."""
    
    # Connection string for the detected Power BI Desktop instance
    connection_string = "Data Source=localhost:51542"
    
    print("Testing DAX-based Local Power BI Desktop Exploration")
    print("=" * 60)
    
    # Test 1: Get tables
    print("\n1. Testing get_tables_via_dax...")
    try:
        result = explore_local_powerbi_model_dax(connection_string, 'tables')
        result_data = json.loads(result)
        print(f"✅ Tables query successful")
        print(f"   Total tables: {result_data.get('total_tables', 'Unknown')}")
        
        if result_data.get('success') and result_data.get('tables'):
            print("   Sample tables:")
            for i, table in enumerate(result_data['tables'][:3]):  # Show first 3
                print(f"     {i+1}. {table.get('name', 'Unknown')} (Hidden: {table.get('is_hidden', 'Unknown')})")
        
    except Exception as e:
        print(f"❌ Tables query failed: {str(e)}")
    
    # Test 2: Get columns
    print("\n2. Testing get_columns_via_dax...")
    try:
        result = explore_local_powerbi_model_dax(connection_string, 'columns')
        result_data = json.loads(result)
        print(f"✅ Columns query successful")
        print(f"   Total columns: {result_data.get('total_columns', 'Unknown')}")
        
        if result_data.get('success') and result_data.get('columns'):
            print("   Sample columns:")
            for i, column in enumerate(result_data['columns'][:5]):  # Show first 5
                print(f"     {i+1}. {column.get('table_name', 'Unknown')}.{column.get('column_name', 'Unknown')} ({column.get('data_type', 'Unknown')})")
                
    except Exception as e:
        print(f"❌ Columns query failed: {str(e)}")
    
    # Test 3: Get measures
    print("\n3. Testing get_measures_via_dax...")
    try:
        result = explore_local_powerbi_model_dax(connection_string, 'measures')
        result_data = json.loads(result)
        print(f"✅ Measures query successful")
        print(f"   Total measures: {result_data.get('total_measures', 'Unknown')}")
        
        if result_data.get('success') and result_data.get('measures'):
            print("   Sample measures:")
            for i, measure in enumerate(result_data['measures'][:3]):  # Show first 3
                print(f"     {i+1}. {measure.get('table_name', 'Unknown')}.{measure.get('name', 'Unknown')}")
                
    except Exception as e:
        print(f"❌ Measures query failed: {str(e)}")

if __name__ == "__main__":
    test_dax_based_exploration()
