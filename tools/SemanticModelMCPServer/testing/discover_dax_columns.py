"""
Test to discover the actual column names available in DAX INFO functions.
"""

import os
import sys
import json

# Add the project root to the path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
sys.path.insert(0, parent_dir)

def discover_dax_info_columns():
    """Discover the actual column names in DAX INFO functions."""
    
    connection_string = "Data Source=localhost:51542"
    
    try:
        import clr
        import os
        
        # Add references to Analysis Services libraries
        current_dir = os.path.dirname(os.path.abspath(__file__))
        parent_dir = os.path.dirname(current_dir)
        dotnet_dir = os.path.join(parent_dir, "dotnet")
        
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
        from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
        
        # Connect to local Power BI Desktop
        conn = AdomdConnection(connection_string)
        conn.Open()
        
        print("Discovering available columns in DAX INFO functions...")
        print("=" * 60)
        
        # Test INFO.TABLES() columns
        print("\n1. INFO.TABLES() columns:")
        try:
            cmd = conn.CreateCommand()
            cmd.CommandText = "EVALUATE TOPN(1, INFO.TABLES())"
            
            reader = cmd.ExecuteReader()
            
            if reader.Read():
                print(f"   Field count: {reader.FieldCount}")
                for i in range(reader.FieldCount):
                    field_name = reader.GetName(i)
                    try:
                        value = reader[i]
                        print(f"   {i}: {field_name} = {value}")
                    except:
                        print(f"   {i}: {field_name} = <cannot read>")
            
            reader.Close()
        except Exception as e:
            print(f"   Error: {e}")
        
        # Test INFO.COLUMNS() columns
        print("\n2. INFO.COLUMNS() columns:")
        try:
            cmd = conn.CreateCommand()
            cmd.CommandText = "EVALUATE TOPN(1, INFO.COLUMNS())"
            
            reader = cmd.ExecuteReader()
            
            if reader.Read():
                print(f"   Field count: {reader.FieldCount}")
                for i in range(reader.FieldCount):
                    field_name = reader.GetName(i)
                    try:
                        value = reader[i]
                        print(f"   {i}: {field_name} = {value}")
                    except:
                        print(f"   {i}: {field_name} = <cannot read>")
            
            reader.Close()
        except Exception as e:
            print(f"   Error: {e}")
        
        # Test INFO.MEASURES() columns
        print("\n3. INFO.MEASURES() columns:")
        try:
            cmd = conn.CreateCommand()
            cmd.CommandText = "EVALUATE TOPN(1, INFO.MEASURES())"
            
            reader = cmd.ExecuteReader()
            
            if reader.Read():
                print(f"   Field count: {reader.FieldCount}")
                for i in range(reader.FieldCount):
                    field_name = reader.GetName(i)
                    try:
                        value = reader[i]
                        print(f"   {i}: {field_name} = {value}")
                    except:
                        print(f"   {i}: {field_name} = <cannot read>")
            
            reader.Close()
        except Exception as e:
            print(f"   Error: {e}")
        
        conn.Close()
        
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    discover_dax_info_columns()
