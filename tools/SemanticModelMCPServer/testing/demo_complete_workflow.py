"""
Final demonstration of local Power BI Desktop exploration capabilities.
This shows the complete workflow that was requested by the user.
"""

import os
import sys
import json

# Add the project root to the path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

from tools.simple_dax_explorer import explore_local_powerbi_simple, execute_local_dax_query
from tools.powerbi_desktop_detector import detect_powerbi_desktop_instances

def demonstrate_local_powerbi_exploration():
    """Demonstrate the complete local Power BI Desktop exploration workflow."""
    
    print("🚀 Local Power BI Desktop Exploration Demonstration")
    print("=" * 60)
    
    # Step 1: Detect local Power BI Desktop instances
    print("\n📱 Step 1: Detecting local Power BI Desktop instances...")
    try:
        detection_result = detect_powerbi_desktop_instances()
        detection_data = json.loads(detection_result)
        
        if detection_data.get('success') and detection_data.get('powerbi_desktop_instances'):
            instances = detection_data['powerbi_desktop_instances']
            print(f"✅ Found {len(instances)} Power BI Desktop instance(s)")
            
            for i, instance in enumerate(instances):
                print(f"   Instance {i+1}:")
                print(f"     📁 File: {os.path.basename(instance.get('file_path', 'Unknown'))}")
                print(f"     🔌 Port: {instance.get('analysis_services_port', 'Unknown')}")
                print(f"     🔗 Connection: {instance.get('connection_string', 'Unknown')}")
                
            # Use the first instance for exploration
            connection_string = instances[0]['connection_string']
            
        else:
            print("❌ No Power BI Desktop instances found")
            print("   Please ensure Power BI Desktop is running with a model open")
            return
            
    except Exception as e:
        print(f"❌ Error detecting instances: {str(e)}")
        return
    
    # Step 2: List tables in the local model
    print(f"\n📊 Step 2: Listing tables in local Power BI Desktop model...")
    try:
        tables_result = explore_local_powerbi_simple(connection_string, 'tables')
        tables_data = json.loads(tables_result)
        
        if tables_data.get('success'):
            tables = tables_data.get('tables', [])
            print(f"✅ Found {len(tables)} table(s) in the model:")
            
            for i, table in enumerate(tables):
                visibility = "🔒 Hidden" if table.get('is_hidden') else "👁️ Visible"
                print(f"   {i+1}. {table.get('name', 'Unknown')} ({visibility})")
                
        else:
            print(f"❌ Failed to list tables: {tables_data.get('error', 'Unknown error')}")
            
    except Exception as e:
        print(f"❌ Error listing tables: {str(e)}")
        return
    
    # Step 3: Get columns for a specific table
    if tables:
        first_table = tables[0]['name']
        print(f"\n📋 Step 3: Listing columns in '{first_table}' table...")
        try:
            columns_result = explore_local_powerbi_simple(connection_string, 'columns', first_table)
            columns_data = json.loads(columns_result)
            
            if columns_data.get('success'):
                columns = columns_data.get('columns', [])
                print(f"✅ Found {len(columns)} column(s) in '{first_table}':")
                
                for i, column in enumerate(columns):
                    col_name = column.get('explicit_name', column.get('inferred_name', 'Unknown'))
                    data_type = column.get('data_type', 'Unknown')
                    visibility = "🔒 Hidden" if column.get('is_hidden') else "👁️ Visible"
                    key_indicator = "🔑 Key" if column.get('is_key') else ""
                    
                    print(f"   {i+1}. {col_name} (Type: {data_type}) {visibility} {key_indicator}")
                    
            else:
                print(f"❌ Failed to list columns: {columns_data.get('error', 'Unknown error')}")
                
        except Exception as e:
            print(f"❌ Error listing columns: {str(e)}")
    
    # Step 4: List measures in the model
    print(f"\n📐 Step 4: Listing measures in the model...")
    try:
        measures_result = explore_local_powerbi_simple(connection_string, 'measures')
        measures_data = json.loads(measures_result)
        
        if measures_data.get('success'):
            measures = measures_data.get('measures', [])
            print(f"✅ Found {len(measures)} measure(s) in the model:")
            
            for i, measure in enumerate(measures):
                table_name = measure.get('table_name', 'Unknown')
                measure_name = measure.get('name', 'Unknown')
                visibility = "🔒 Hidden" if measure.get('is_hidden') else "👁️ Visible"
                expression = measure.get('expression', '')
                
                print(f"   {i+1}. {table_name}.{measure_name} ({visibility})")
                if expression and len(expression) < 80:
                    print(f"       Formula: {expression}")
                elif expression:
                    print(f"       Formula: {expression[:80]}...")
                    
        else:
            print(f"❌ Failed to list measures: {measures_data.get('error', 'Unknown error')}")
            
    except Exception as e:
        print(f"❌ Error listing measures: {str(e)}")
    
    # Step 5: Execute a sample DAX query
    print(f"\n🔍 Step 5: Executing sample DAX query...")
    try:
        sample_query = "EVALUATE TOPN(3, INFO.TABLES())"
        query_result = execute_local_dax_query(connection_string, sample_query)
        query_data = json.loads(query_result)
        
        if query_data.get('success'):
            rows = query_data.get('rows', [])
            print(f"✅ DAX query executed successfully, returned {len(rows)} row(s)")
            print(f"   Query: {sample_query}")
            print("   Results:")
            
            for i, row in enumerate(rows):
                table_name = row.get('[Name]', 'Unknown')
                is_hidden = row.get('[IsHidden]', 'Unknown')
                print(f"     {i+1}. {table_name} (Hidden: {is_hidden})")
                
        else:
            print(f"❌ Failed to execute DAX query: {query_data.get('error', 'Unknown error')}")
            
    except Exception as e:
        print(f"❌ Error executing DAX query: {str(e)}")
    
    print("\n" + "=" * 60)
    print("🎉 Local Power BI Desktop exploration complete!")
    print("✨ You can now use these tools to explore any local Power BI Desktop model")
    print("")
    print("📚 Available capabilities:")
    print("   • Detect running Power BI Desktop instances")
    print("   • List all tables with visibility information")
    print("   • List columns for specific tables with data types")
    print("   • List measures with expressions")
    print("   • Execute custom DAX queries")
    print("")
    print("🔧 Integration status: ✅ Ready for MCP server usage")

if __name__ == "__main__":
    demonstrate_local_powerbi_exploration()
