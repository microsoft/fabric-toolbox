"""
Test the simple DAX-based local Power BI Desktop exploration.
"""

import os
import sys

# Add the project root to the path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from tools.simple_dax_explorer import explore_local_powerbi_simple
import json

def test_simple_dax_exploration():
    """Test the simple DAX-based exploration approach."""
    
    # Connection string for the detected Power BI Desktop instance
    connection_string = "Data Source=localhost:51542"
    
    print("Testing Simple DAX-based Local Power BI Desktop Exploration")
    print("=" * 65)
    
    # Test 1: Get tables
    print("\n1. Testing get_tables_simple...")
    try:
        result = explore_local_powerbi_simple(connection_string, 'tables')
        result_data = json.loads(result)
        print(f"✅ Tables query successful")
        print(f"   Total tables: {result_data.get('total_tables', 'Unknown')}")
        
        if result_data.get('success') and result_data.get('tables'):
            print("   Tables found:")
            for i, table in enumerate(result_data['tables']):
                print(f"     {i+1}. {table.get('name', 'Unknown')} (Hidden: {table.get('is_hidden', 'Unknown')})")
        
    except Exception as e:
        print(f"❌ Tables query failed: {str(e)}")
    
    # Test 2: Get columns
    print("\n2. Testing get_columns_simple...")
    try:
        result = explore_local_powerbi_simple(connection_string, 'columns')
        result_data = json.loads(result)
        print(f"✅ Columns query successful")
        print(f"   Total columns: {result_data.get('total_columns', 'Unknown')}")
        
        if result_data.get('success') and result_data.get('columns'):
            print("   Sample columns:")
            for i, column in enumerate(result_data['columns'][:5]):  # Show first 5
                table_name = column.get('table_name', 'Unknown')
                col_name = column.get('explicit_name', column.get('inferred_name', 'Unknown'))
                is_hidden = column.get('is_hidden', False)
                print(f"     {i+1}. {table_name}.{col_name} (Hidden: {is_hidden})")
                
    except Exception as e:
        print(f"❌ Columns query failed: {str(e)}")
    
    # Test 3: Get measures
    print("\n3. Testing get_measures_simple...")
    try:
        result = explore_local_powerbi_simple(connection_string, 'measures')
        result_data = json.loads(result)
        print(f"✅ Measures query successful")
        print(f"   Total measures: {result_data.get('total_measures', 'Unknown')}")
        
        if result_data.get('success') and result_data.get('measures'):
            print("   Measures found:")
            for i, measure in enumerate(result_data['measures']):
                table_name = measure.get('table_name', 'Unknown')
                measure_name = measure.get('name', 'Unknown')
                is_hidden = measure.get('is_hidden', False)
                print(f"     {i+1}. {table_name}.{measure_name} (Hidden: {is_hidden})")
                
    except Exception as e:
        print(f"❌ Measures query failed: {str(e)}")
    
    # Test 4: Get columns for specific table
    print("\n4. Testing get_columns_simple for specific table 'Customers'...")
    try:
        result = explore_local_powerbi_simple(connection_string, 'columns', 'Customers')
        result_data = json.loads(result)
        print(f"✅ Customers columns query successful")
        print(f"   Total columns in Customers: {result_data.get('total_columns', 'Unknown')}")
        
        if result_data.get('success') and result_data.get('columns'):
            print("   Customers columns:")
            for i, column in enumerate(result_data['columns']):
                col_name = column.get('explicit_name', column.get('inferred_name', 'Unknown'))
                data_type = column.get('data_type', 'Unknown')
                is_hidden = column.get('is_hidden', False)
                print(f"     {i+1}. {col_name} ({data_type}) (Hidden: {is_hidden})")
                
    except Exception as e:
        print(f"❌ Customers columns query failed: {str(e)}")

if __name__ == "__main__":
    test_simple_dax_exploration()
