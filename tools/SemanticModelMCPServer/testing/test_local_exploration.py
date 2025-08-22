"""
Test the new local Power BI Desktop exploration tools
"""

import sys
import os
import json

# Add the parent directory to the Python path to import modules
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

def test_local_exploration():
    """Test the local Power BI Desktop exploration functionality."""
    try:
        from tools.local_powerbi_explorer import explore_local_powerbi_model, execute_local_dax_query
        
        # Use the detected connection string
        connection_string = "Data Source=localhost:51542"
        
        print("🔍 Testing Local Power BI Desktop Model Exploration")
        print("=" * 60)
        print(f"🔗 Connection: {connection_string}")
        
        # Test 1: List tables
        print("\n📊 Test 1: Listing Tables")
        print("-" * 30)
        try:
            tables_result = explore_local_powerbi_model(connection_string, 'tables')
            tables_data = json.loads(tables_result)
            
            if tables_data['success']:
                print(f"✅ Found {tables_data['total_tables']} tables:")
                for i, table in enumerate(tables_data['tables'][:5], 1):  # Show first 5
                    print(f"  {i}. {table['name']} ({table['row_count']} rows)")
                    
                if len(tables_data['tables']) > 5:
                    print(f"  ... and {len(tables_data['tables']) - 5} more tables")
            else:
                print(f"❌ Failed to get tables: {tables_data['error']}")
                
        except Exception as e:
            print(f"❌ Error testing tables: {e}")
        
        # Test 2: List measures
        print("\n📈 Test 2: Listing Measures")
        print("-" * 30)
        try:
            measures_result = explore_local_powerbi_model(connection_string, 'measures')
            measures_data = json.loads(measures_result)
            
            if measures_data['success']:
                print(f"✅ Found {measures_data['total_measures']} measures:")
                for i, measure in enumerate(measures_data['measures'][:3], 1):  # Show first 3
                    print(f"  {i}. {measure['name']}")
                    
                if len(measures_data['measures']) > 3:
                    print(f"  ... and {len(measures_data['measures']) - 3} more measures")
            else:
                print(f"❌ Failed to get measures: {measures_data['error']}")
                
        except Exception as e:
            print(f"❌ Error testing measures: {e}")
        
        # Test 3: Simple DAX query
        print("\n🧮 Test 3: Simple DAX Query")
        print("-" * 30)
        try:
            # Try a simple DAX query to list tables
            dax_query = "EVALUATE INFO.TABLES()"
            dax_result = execute_local_dax_query(connection_string, dax_query)
            dax_data = json.loads(dax_result)
            
            if dax_data['success']:
                print(f"✅ DAX query executed successfully:")
                print(f"  Query: {dax_query}")
                print(f"  Columns: {len(dax_data['columns'])}")
                print(f"  Rows: {dax_data['row_count']}")
                
                if dax_data['columns']:
                    print(f"  Column names: {[col['name'] for col in dax_data['columns']]}")
            else:
                print(f"❌ DAX query failed: {dax_data['error']}")
                
        except Exception as e:
            print(f"❌ Error testing DAX: {e}")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Test error: {e}")
        return False

def main():
    """Run the local exploration tests."""
    print("🚀 Local Power BI Desktop Exploration Tests")
    print("=" * 60)
    
    success = test_local_exploration()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 Local exploration tests completed!")
        print("\n💡 If successful, you can now use these MCP tools:")
        print("   - explore_local_powerbi_tables(connection_string)")
        print("   - explore_local_powerbi_columns(connection_string, table_name)")
        print("   - explore_local_powerbi_measures(connection_string)")
        print("   - execute_local_powerbi_dax(connection_string, dax_query)")
    else:
        print("⚠️ Tests failed. Check error messages above.")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
