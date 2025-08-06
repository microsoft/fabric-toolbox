from fastmcp import FastMCP
import logging
import clr
import os
import json
import sys
from core.auth import get_access_token
from core.azure_token_manager import get_cached_azure_token, clear_token_cache
from tools.fabric_metadata import list_workspaces, list_datasets, get_workspace_id, list_notebooks, list_delta_tables, list_lakehouses, list_lakehouse_files, get_lakehouse_sql_connection_string as fabric_get_lakehouse_sql_connection_string
import urllib.parse
from src.helper import count_nodes_with_name
import time
from datetime import datetime, timedelta
from prompts import register_prompts

# Try to import pyodbc - it's needed for SQL Analytics Endpoint queries
try:
    import pyodbc
except ImportError:
    pyodbc = None

def load_instructions():
    """Load MCP instructions from external markdown file."""
    try:
        instructions_path = os.path.join(os.path.dirname(__file__), 'mcp_instructions.md')
        with open(instructions_path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        # Fallback to basic instructions if file not found
        return """
        A tool to browse and manage semantic models in Microsoft Fabric and Power BI.
        
        ## Available Tools:
        - List Power BI Workspaces
        - List Power BI Datasets  
        - Execute DAX Queries
        - Update Model using TMSL
        
        See mcp_instructions.md for complete documentation.
        """
    except Exception as e:
        print(f"Warning: Could not load instructions from file: {e}")
        return "Model Browser MCP Server - See mcp_instructions.md for documentation."

mcp = FastMCP(
    name="Model Browser", 
    instructions=load_instructions()
)

# Register all MCP prompts from the prompts module
register_prompts(mcp)

@mcp.tool
def list_powerbi_workspaces() -> str:
    """Lists available Power BI workspaces for the current user."""
    return list_workspaces()

@mcp.tool
def list_powerbi_datasets(workspace_id: str) -> str:
    """Lists all datasets in a specified Power BI workspace."""
    return list_datasets(workspace_id)

@mcp.tool
def get_powerbi_workspace_id(workspace_name: str) -> str:
    """Gets the workspace ID for a given workspace name."""
    return get_workspace_id(workspace_name)

@mcp.tool
def list_powerbi_notebooks(workspace_id: str) -> str:
    """Lists all notebooks in a specified Power BI workspace."""
    return list_notebooks(workspace_id)

@mcp.tool
def list_fabric_lakehouses(workspace_id: str) -> str:
    """Lists all lakehouses in a specified Fabric workspace."""
    return list_lakehouses(workspace_id)

@mcp.tool
def list_fabric_delta_tables(workspace_id: str, lakehouse_id: str = None) -> str:
    """Lists all Delta Tables in a specified Fabric Lakehouse.
    If lakehouse_id is not provided, will use the first lakehouse found in the workspace.
    This function now supports both regular lakehouses and schema-enabled lakehouses by automatically
    falling back to SQL Analytics Endpoint queries when the Fabric API returns an error for schema-enabled lakehouses.
    """
    return list_delta_tables(workspace_id, lakehouse_id)

@mcp.tool
def debug_lakehouse_contents(workspace_id: str, lakehouse_id: str = None) -> str:
    """Debug function to check various API endpoints for lakehouse contents including files and items.
    """
    return list_lakehouse_files(workspace_id, lakehouse_id)

@mcp.tool
def get_lakehouse_sql_connection_string(workspace_id: str, lakehouse_id: str = None, lakehouse_name: str = None) -> str:
    """Gets the SQL endpoint connection string for a specified Fabric Lakehouse.
    You can specify either lakehouse_id or lakehouse_name to identify the lakehouse.
    Returns connection information including server name and connection string templates.
    """
    return fabric_get_lakehouse_sql_connection_string(workspace_id, lakehouse_id, lakehouse_name)

@mcp.tool
def clear_azure_token_cache() -> str:
    """Clears the Azure authentication token cache. 
    Useful for debugging authentication issues or forcing token refresh.
    """
    from core.azure_token_manager import clear_token_cache, get_token_cache_status
    
    # Get status before clearing
    status_before = get_token_cache_status()
    
    # Clear the cache
    clear_token_cache()
    
    # Get status after clearing
    status_after = get_token_cache_status()
    
    return f"Azure token cache cleared successfully. Had {len(status_before)} cached tokens, now has {len(status_after)} cached tokens."

@mcp.tool
def get_azure_token_status() -> str:
    """Gets the current status of the Azure token cache.
    Shows which tokens are cached, their expiration times, and validity status.
    """
    from core.azure_token_manager import get_token_cache_status
    import json
    
    status = get_token_cache_status()
    
    if not status:
        return "No Azure tokens currently cached."
    
    return json.dumps(status, indent=2)

@mcp.tool
def execute_dax_query(workspace_name:str, dataset_name: str, dax_query: str, dataset_id: str = None) -> list[dict]:
    """Executes a DAX query against the Power BI model.
    This tool connects to the specified Power BI workspace and dataset name, executes the provided DAX query,
    Use the dataset_name to specify the model to query and NOT the dataset ID.
    The function connects to the Power BI service using an access token, executes the DAX query,
    and returns the results.
    """  
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    #clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))

    from Microsoft.AnalysisServices.AdomdClient import AdomdConnection ,AdomdDataReader  # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"

    workspace_name_encoded = urllib.parse.quote(workspace_name)
    # Use URL-encoded workspace name and standard XMLA connection format
    # The connection string format is: Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name};Password={access_token};Catalog={dataset_name};
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token};Catalog={dataset_name};"

    connection = AdomdConnection(connection_string)
    connection.Open()
    try:
        command = connection.CreateCommand()
        command.CommandText = dax_query
        reader: AdomdDataReader = command.ExecuteReader()
        results = []
        while reader.Read():
            row = {}
            for i in range(reader.FieldCount):
                row[reader.GetName(i)] = reader.GetValue(i)
            results.append(row)
    except Exception as e:
        print(f"Error executing DAX query: {e}")
        results = []
    connection.Close()
    return results

@mcp.tool
def update_model_using_tmsl(workspace_name: str, dataset_name: str, tmsl_definition: str) -> str:
    """Updates the TMSL definition for an Analysis Services Model.
    This tool connects to the specified Power BI workspace and dataset name, updates the TMSL definition,
    and returns a success message or an error if the update fails.
    The function connects to the Power BI service using an access token, deserializes the TMSL definition,
    updates the model, and returns the result.
    Note: The TMSL definition should be a valid serialized TMSL string.
    """   
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")

    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))

    from Microsoft.AnalysisServices.Tabular import Server# type: ignore
    from Microsoft.AnalysisServices import XmlaResultCollection  # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    
    workspace_name_encoded = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"
    server = Server()
    
    try:
        server.Connect(connection_string)
        
        # Parse the TMSL definition to check its structure
        try:
            tmsl = json.loads(tmsl_definition)
        except json.JSONDecodeError as e:
            return f"Error: Invalid JSON in TMSL definition - {e}"
        
        databaseCount = count_nodes_with_name(tmsl, "database")
        tableCount = count_nodes_with_name(tmsl, "table")
        
        # Check if the tmsl_definition already has createOrReplace at the root level
        if "createOrReplace" in tmsl:
            # TMSL already has createOrReplace wrapper, use as-is
            final_tmsl = tmsl_definition
        elif databaseCount > 0:
            # TMSL contains database definition, wrap with createOrReplace for database
            final_tmsl = json.dumps({
                "createOrReplace": {
                    "object": {
                        "database": dataset_name
                    },
                    "database": tmsl
                }
            })
        elif tableCount == 1:
            # TMSL contains single table definition, extract table name and wrap appropriately
            table_name = None
            if "name" in tmsl:
                table_name = tmsl["name"]
            elif isinstance(tmsl, dict):
                # Try to find table name in the structure
                for key, value in tmsl.items():
                    if key == "name" and isinstance(value, str):
                        table_name = value
                        break
            
            if not table_name:
                return "Error: Cannot determine table name from TMSL definition"
                
            final_tmsl = json.dumps({
                "createOrReplace": {
                    "object": {
                        "database": dataset_name,
                        "table": table_name
                    },
                    "table": tmsl
                }
            })
        else:
            # Assume it's a general model update, wrap with database createOrReplace
            final_tmsl = json.dumps({
                "createOrReplace": {
                    "object": {
                        "database": dataset_name
                    },
                    "database": tmsl
                }
            })

        retval: XmlaResultCollection = server.Execute(final_tmsl)
        
        # Check if the execution was successful by examining the XmlaResultCollection
        if retval is None:
            return f"TMSL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'. ✅"
        
        # Iterate through the XmlaResultCollection to check for errors or messages
        errors = []
        messages = []
        warnings = []
        
        for result in retval:
            # Check for errors in the result
            if hasattr(result, 'HasErrors') and result.HasErrors:
                if hasattr(result, 'Messages'):
                    for message in result.Messages:
                        if hasattr(message, 'MessageType'):
                            if str(message.MessageType).lower() == 'error':
                                errors.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                            elif str(message.MessageType).lower() == 'warning':
                                warnings.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                            else:
                                messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                        else:
                            # If no MessageType, treat as general message
                            messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
            elif hasattr(result, 'Messages'):
                # No explicit errors, but check messages anyway
                for message in result.Messages:
                    if hasattr(message, 'MessageType'):
                        if str(message.MessageType).lower() == 'error':
                            errors.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                        elif str(message.MessageType).lower() == 'warning':
                            warnings.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                        else:
                            messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
                    else:
                        messages.append(str(message.Description) if hasattr(message, 'Description') else str(message))
        
        # Determine the result based on what we found
        if errors:
            error_details = "; ".join(errors)
            return f"Error updating TMSL definition for dataset '{dataset_name}' in workspace '{workspace_name}': {error_details}"
        elif warnings:
            warning_details = "; ".join(warnings)
            success_msg = f"TMSL definition updated for dataset '{dataset_name}' in workspace '{workspace_name}' with warnings: {warning_details} ⚠️"
            if messages:
                success_msg += f" Additional info: {'; '.join(messages)}"
            return success_msg
        elif messages:
            message_details = "; ".join(messages)
            return f"TMSL definition updated for dataset '{dataset_name}' in workspace '{workspace_name}'. Server messages: {message_details} ✅"
        else:
            # No errors, warnings, or messages - successful execution
            return f"TMSL definition updated successfully for dataset '{dataset_name}' in workspace '{workspace_name}'. ✅"
        
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON in TMSL definition - {e}"
    except ConnectionError as e:
        print(f"Connection error in update_model_using_tmsl: {e}")
        return f"Error connecting to Power BI service: {e}"
    except Exception as e:
        # Check if it's an Analysis Services specific error that might contain useful details
        error_message = str(e)
        print(f"Error in update_model_using_tmsl: {e}")
        
        # Provide more context for common error scenarios
        if "authentication" in error_message.lower() or "unauthorized" in error_message.lower():
            return f"Authentication error: {error_message}. Please check your access token and permissions."
        elif "not found" in error_message.lower():
            return f"Dataset or workspace not found: {error_message}. Please verify the workspace name '{workspace_name}' and dataset name '{dataset_name}' are correct."
        elif "permission" in error_message.lower() or "access" in error_message.lower():
            return f"Permission error: {error_message}. You may not have sufficient permissions to modify this dataset."
        else:
            return f"Error updating TMSL definition: {error_message}"
    finally:
        # Ensure server connection is always closed
        try:
            if server and hasattr(server, 'Connected') and server.Connected:
                server.Disconnect()
        except:
            pass  # Ignore errors during cleanup
    
@mcp.tool
def get_model_definition(workspace_name:str = None, dataset_name:str=None) -> str:
    """Gets TMSL definition for an Analysis Services Model.
    This tool connects to the specified Power BI workspace and dataset name, retrieves the model definition,
    and returns the TMSL definition as a string.
    The function connects to the Power BI service using an access token, retrieves the model definition,
    and returns the result.
    Note: The workspace_name and dataset_name should be valid names in the Power BI service.
    """
    

    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotnet_dir = os.path.join(script_dir, "dotnet")
    
    print(f"Using .NET assemblies from: {dotnet_dir}")
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
    clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))
    
    from Microsoft.AnalysisServices.Tabular import Server,Database, JsonSerializer,SerializeOptions # type: ignore

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"

    # Use URL-encoded workspace name and standard XMLA connection format

    workspace_name = urllib.parse.quote(workspace_name)
    connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name};Password={access_token}"

    server: Server = Server()
    server.Connect(connection_string)
    database: Database = server.Databases.GetByName(dataset_name)

    options = SerializeOptions()
    options.IgnoreTimestamps = True

    tmsl_definition = JsonSerializer.SerializeDatabase(database, options)
    return tmsl_definition

@mcp.tool
def query_lakehouse_sql_endpoint(workspace_id: str, sql_query: str, lakehouse_id: str = None, lakehouse_name: str = None) -> str:
    """Executes a SQL query against a Fabric Lakehouse SQL Analytics Endpoint to validate table schemas and data.
    This tool connects to the specified Fabric Lakehouse SQL Analytics Endpoint and executes the provided SQL query.
    Use this tool to:
    - Validate actual column names and data types in lakehouse tables
    - Query table schemas before creating DirectLake models
    - Inspect data samples from lakehouse tables
    - Verify table structures match your model expectations
    
    Args:
        workspace_id: The Fabric workspace ID containing the lakehouse
        sql_query: The SQL query to execute (e.g., "SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'date'")
        lakehouse_id: Optional specific lakehouse ID to query
        lakehouse_name: Optional lakehouse name to query (alternative to lakehouse_id)
    
    Returns:
        JSON string containing query results or error message
    
    Example queries for schema validation:
    - "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_1'"
    - "SELECT TOP 5 * FROM date"
    - "SHOW TABLES"
    """
    import json

    # Get cached or fresh authentication token
    token_struct, success, error = get_cached_azure_token("https://database.windows.net/.default")
    if not success:
        return json.dumps({
            "success": False,
            "error": f"Authentication failed: {error}"
        }, indent=2)

    # Check if pyodbc is available
    if pyodbc is None:
        return json.dumps({
            "success": False,
            "error": "pyodbc is not installed. Please install it using: pip install pyodbc"
        }, indent=2)
    
    try:
        # Get the SQL Analytics Endpoint connection string
        connection_info = fabric_get_lakehouse_sql_connection_string(workspace_id, lakehouse_id, lakehouse_name)
        
        if "error" in connection_info.lower():
            return f"Error getting connection string: {connection_info}"
        
        # Parse the connection info to get the server and endpoint ID
        connection_data = json.loads(connection_info)
        server_name = connection_data.get("sql_endpoint", {}).get("server_name")
        endpoint_id = connection_data.get("sql_endpoint", {}).get("endpoint_id")
        
        if not server_name or not endpoint_id:
            return "Error: Could not retrieve SQL Analytics Endpoint information"
        
        # Build connection string for SQL Analytics Endpoint
        # For Fabric SQL Analytics Endpoints, use the lakehouse name as the database
        lakehouse_name = connection_data.get("lakehouse_name")
        if not lakehouse_name:
            return json.dumps({
                "success": False,
                "error": "Could not determine lakehouse name for database connection"
            }, indent=2)
        
        # Try different ODBC drivers in order of preference
        available_drivers = [
            "ODBC Driver 18 for SQL Server",
            "ODBC Driver 17 for SQL Server", 
            "SQL Server"
        ]
        
        # Detect which driver is available
        available_driver = None
        available_pyodbc_drivers = pyodbc.drivers()
        
        for driver in available_drivers:
            if driver in available_pyodbc_drivers:
                available_driver = driver
                break
        
        if not available_driver:
            return json.dumps({
                "success": False,
                "error": "No compatible ODBC driver found. Please install ODBC Driver for SQL Server.",
                "available_drivers": list(available_pyodbc_drivers),
                "looking_for": available_drivers
            }, indent=2)
        
        connection_string = (
            f"Driver={{{available_driver}}};"
            f"Server={server_name};"
            f"Database={lakehouse_name};"
            f"Encrypt=yes;"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=30;"
        )
        
        # Debug: log connection attempt
        print(f"Attempting connection with driver: {available_driver}")
        print(f"Connection string: {connection_string}")
        
        # Execute the query using ActiveDirectoryInteractive authentication
        with pyodbc.connect(connection_string, attrs_before={1256  : token_struct}) as conn:
            cursor = conn.cursor()
            cursor.execute(sql_query)
            
            # Get column names
            columns = [column[0] for column in cursor.description]
            
            # Fetch results
            rows = cursor.fetchall()
            
            # Convert to list of dictionaries
            results = []
            for row in rows:
                row_dict = {}
                for i, value in enumerate(row):
                    # Handle special data types
                    if hasattr(value, 'isoformat'):  # datetime objects
                        row_dict[columns[i]] = value.isoformat()
                    elif isinstance(value, (bytes, bytearray)):  # binary data
                        row_dict[columns[i]] = str(value)
                    else:
                        row_dict[columns[i]] = value
                results.append(row_dict)
            
            return json.dumps({
                "success": True,
                "query": sql_query,
                "columns": columns,
                "row_count": len(results),
                "results": results[:100],  # Limit to first 100 rows to avoid large responses
                "note": f"Showing first 100 rows out of {len(results)} total rows" if len(results) > 100 else None
            }, indent=2)
            
    except pyodbc.Error as e:
        error_details = str(e)
        return json.dumps({
            "success": False,
            "error": f"SQL Error: {error_details}",
            "query": sql_query,
            "debug_info": {
                "server_name": server_name if 'server_name' in locals() else "Not available",
                "lakehouse_name": lakehouse_name if 'lakehouse_name' in locals() else "Not available",
                "available_driver": available_driver if 'available_driver' in locals() else "Not detected",
                "connection_string": connection_string if 'connection_string' in locals() else "Not available"
            }
        }, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": f"Connection Error: {str(e)}",
            "query": sql_query,
            "debug_info": {
                "connection_info": connection_info if 'connection_info' in locals() else "Not available"
            }
        }, indent=2)


def main():
    """Main entry point for the Semantic Model MCP Server."""

    logging.info("Starting Semantic Model MCP Server")
    mcp.run()

if __name__ == "__main__":
    main()
