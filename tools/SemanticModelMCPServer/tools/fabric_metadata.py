# Tool to list Power BI workspaces
import json
from core.auth import get_access_token

def list_workspaces() -> str:
    """Lists available Power BI workspaces for the current user. This tool retrieves the workspaces using the Power BI REST API.
    It returns a dictionary array of workspace names and IDs.
    It is useful for identifying which workspaces you can access and work with.
    It gets an access token using the Power BI REST API.
    """
    import requests
    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    url = "https://api.powerbi.com/v1.0/myorg/groups"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return f"Error: {response.status_code} - {response.text}"
    groups = response.json().get("value", [])
    if not groups:
        return "No workspaces found."
    
    # Extract only name and id from each workspace
    filtered_workspaces = [{"name": group.get("name"), "id": group.get("id")} for group in groups]
    return json.dumps(filtered_workspaces, indent=2)

# Tool to list datasets in a Power BI workspace

def list_datasets(workspace_id: str) -> str:
    """Lists all datasets in a specified Power BI workspace using REST API."""
    import requests
    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    
    url = f"https://api.powerbi.com/v1.0/myorg/groups/{workspace_id}/datasets"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        return f"Error: {response.status_code} - {response.text}"
    
    datasets = response.json().get("value", [])
    if not datasets:
        return "No datasets found in this workspace."
    
    return json.dumps(datasets, indent=2)

# Tool to get workspace ID by name
def get_workspace_id(workspace_name: str) -> str:
    """Gets the workspace ID for a given workspace name.  This is useful for retrieving datasets."""
    import requests

    access_token = get_access_token()
    if not access_token:
        return "Error: No valid access token available"
    
    url = "https://api.powerbi.com/v1.0/myorg/groups"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        return f"Error: {response.status_code} - {response.text}"
    
    groups = response.json().get("value", [])
    for group in groups:
        if group.get("name") == workspace_name:
            return group.get("id")
    
    return f"Workspace '{workspace_name}' not found"

# Tool to list notebooks in a Power BI workspace

def list_notebooks(workspace_id: str) -> str:
    """Lists all notebooks in a specified Power BI workspace using REST API.
    
    Args:
        workspace_id (str): The unique identifier of the Power BI workspace
        
    Returns:
        str: JSON string containing notebook information or error message
    """
    import requests
    
    # Input validation - ensure workspace_id is provided and not empty
    if not workspace_id or not workspace_id.strip():
        return "Error: Workspace ID is required and cannot be empty"
    
    try:
        # Get authentication token for Power BI API access
        access_token = get_access_token()
        if not access_token:
            return "Error: No valid access token available"
        
        # Construct API endpoint URL for listing notebooks
        # Strip whitespace from workspace_id to handle user input errors
        url = f"https://api.powerbi.com/v1.0/myorg/groups/{workspace_id.strip()}/notebooks"
        
        # Set up authorization header with Bearer token
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # Make the API request with 30-second timeout to prevent hanging
        response = requests.get(url, headers=headers, timeout=30)
        
        # Handle different HTTP status codes with specific error messages
        if response.status_code == 200:
            # Success - parse the JSON response
            notebooks = response.json().get("value", [])
            if not notebooks:
                return "No notebooks found in this workspace."
            # Return formatted JSON with proper indentation
            return json.dumps(notebooks, indent=2)
        elif response.status_code == 401:
            # Authentication failed - token is invalid or expired
            return "Error: Unauthorized - Invalid or expired access token"
        elif response.status_code == 403:
            # Authorization failed - user doesn't have permission
            return "Error: Forbidden - You don't have permission to access this workspace"
        elif response.status_code == 404:
            # Workspace not found
            return f"Error: Workspace with ID '{workspace_id}' not found"
        elif response.status_code == 429:
            # Rate limiting - too many requests
            return "Error: Too many requests - Please try again later"
        else:
            # Other HTTP errors - return status code and response text
            return f"Error: HTTP {response.status_code} - {response.text}"
            
    # Handle specific request exceptions with informative error messages
    except requests.exceptions.Timeout:
        # Request took longer than 30 seconds
        return "Error: Request timed out - Please try again"
    except requests.exceptions.ConnectionError:
        # Network connectivity issues
        return "Error: Connection failed - Check your internet connection"
    except requests.exceptions.RequestException as e:
        # Other request-related errors
        return f"Error: Request failed - {str(e)}"
    except json.JSONDecodeError:
        # Invalid JSON response from API
        return "Error: Invalid JSON response from Power BI API"
    except Exception as e:
        # Catch-all for any unexpected errors
        return f"Error: Unexpected error occurred - {str(e)}"

# Tool to list Delta Tables in a Fabric Lakehouse

def list_delta_tables(workspace_id: str, lakehouse_id: str = None) -> str:
    """Lists all Delta Tables in a specified Fabric Lakehouse.
    
    Args:
        workspace_id (str): The unique identifier of the Fabric workspace
        lakehouse_id (str, optional): The unique identifier of the Lakehouse. If not provided, will list all lakehouses first.
        
    Returns:
        str: JSON string containing Delta Table information or error message
    """
    import requests
    
    # Input validation - ensure workspace_id is provided and not empty
    if not workspace_id or not workspace_id.strip():
        return "Error: Workspace ID is required and cannot be empty"
    
    try:
        # Get authentication token for Fabric API access
        access_token = get_access_token()
        if not access_token:
            return "Error: No valid access token available"
        
        # Set up authorization header with Bearer token
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # If no lakehouse_id provided, list all lakehouses in the workspace first
        if not lakehouse_id:
            # List all lakehouses in the workspace
            lakehouses_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses"
            lakehouses_response = requests.get(lakehouses_url, headers=headers, timeout=30)
            
            if lakehouses_response.status_code != 200:
                return f"Error listing lakehouses: HTTP {lakehouses_response.status_code} - {lakehouses_response.text}"
            
            lakehouses = lakehouses_response.json().get("value", [])
            if not lakehouses:
                return "No lakehouses found in this workspace."
            
            # For simplicity, use the first lakehouse if multiple exist
            lakehouse_id = lakehouses[0].get("id")
            if not lakehouse_id:
                return "Error: No valid lakehouse ID found"
        
        # Construct API endpoint URL for listing tables in the lakehouse
        tables_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses/{lakehouse_id.strip()}/tables"
        
        # Add timestamp to force fresh API call and avoid caching
        import time
        timestamp = str(int(time.time()))
        print(f"DEBUG: Making API call at {timestamp} to {tables_url}")
        
        # Make the API request with 30-second timeout to prevent hanging
        response = requests.get(tables_url, headers=headers, timeout=30)
        
        # Debug information
        print(f"DEBUG: Response status code: {response.status_code}")
        print(f"DEBUG: Response headers: {dict(response.headers)}")
        print(f"DEBUG: Raw response text: {response.text[:500]}...")
        
        # Handle different HTTP status codes with specific error messages
        if response.status_code == 200:
            # Success - parse the JSON response
            response_json = response.json()
            tables = response_json.get("data", response_json.get("value", []))
            if not tables:
                # Return detailed debug information when no tables found
                return f"No tables found in this lakehouse. API Response: {json.dumps(response.json(), indent=2)}"
            
            # Filter for Delta Tables only (if type information is available)
            delta_tables = []
            for table in tables:
                # Check if it's a Delta Table - this might vary based on API response structure
                table_type = table.get("type", "").lower()
                format_type = table.get("format", "").lower()
                
                if "delta" in table_type or "delta" in format_type or table.get("format") == "Delta":
                    delta_tables.append(table)
                else:
                    # If type info not available, include all tables (most Fabric lakehouse tables are Delta)
                    delta_tables.append(table)
            
            if not delta_tables:
                return f"No Delta Tables found in this lakehouse. Total tables found: {len(tables)}. Raw table data: {json.dumps(tables, indent=2)}"
            
            # Return formatted JSON with proper indentation
            return json.dumps(delta_tables, indent=2)
            
        elif response.status_code == 400:
            # Handle the specific case of schema-enabled lakehouses
            print(f"DEBUG: Got 400 error, checking for schema-enabled lakehouse error")
            print(f"DEBUG: Response text: {response.text}")
            try:
                response_json = response.json()
                print(f"DEBUG: Parsed JSON: {response_json}")
                error_code = response_json.get("errorCode", "")
                print(f"DEBUG: Error code: {error_code}")
                
                if error_code == "UnsupportedOperationForSchemasEnabledLakehouse":
                    # Fall back to using SQL Analytics Endpoint for schema-enabled lakehouses
                    print(f"DEBUG: Lakehouse has schemas enabled, falling back to SQL Analytics Endpoint")
                    return _list_delta_tables_via_sql_endpoint(workspace_id, lakehouse_id)
                else:
                    print(f"DEBUG: Different 400 error: {error_code}")
                    return f"Error: HTTP 400 - {response.text}"
            except Exception as e:
                print(f"DEBUG: Error parsing JSON response: {e}")
                # If we can't parse the JSON, just return the raw error
                return f"Error: HTTP 400 - {response.text}"
                
        elif response.status_code == 401:
            # Authentication failed - token is invalid or expired
            return "Error: Unauthorized - Invalid or expired access token"
        elif response.status_code == 403:
            # Authorization failed - user doesn't have permission
            return "Error: Forbidden - You don't have permission to access this lakehouse"
        elif response.status_code == 404:
            # Lakehouse or workspace not found
            return f"Error: Lakehouse with ID '{lakehouse_id}' not found in workspace '{workspace_id}'"
        elif response.status_code == 429:
            # Rate limiting - too many requests
            return "Error: Too many requests - Please try again later"
        else:
            # Other HTTP errors - return status code and response text
            return f"Error: HTTP {response.status_code} - {response.text}"
            
    # Handle specific request exceptions with informative error messages
    except requests.exceptions.Timeout:
        # Request took longer than 30 seconds
        return "Error: Request timed out - Please try again"
    except requests.exceptions.ConnectionError:
        # Network connectivity issues
        return "Error: Connection failed - Check your internet connection"
    except requests.exceptions.RequestException as e:
        # Other request-related errors
        return f"Error: Request failed - {str(e)}"
    except json.JSONDecodeError:
        # Invalid JSON response from API
        return "Error: Invalid JSON response from Fabric API"
    except Exception as e:
        # Catch-all for any unexpected errors
        return f"Error: Unexpected error occurred - {str(e)}"

def _list_delta_tables_via_sql_endpoint(workspace_id: str, lakehouse_id: str) -> str:
    """Helper function to list Delta tables using SQL Analytics Endpoint for schema-enabled lakehouses.
    
    Args:
        workspace_id (str): The unique identifier of the Fabric workspace
        lakehouse_id (str): The unique identifier of the Lakehouse
        
    Returns:
        str: JSON string containing table information from SQL endpoint
    """
    try:
        # Import the SQL query function from the main server module
        # We need to avoid circular imports, so we'll implement the SQL query logic here
        
        # Get lakehouse connection details first
        lakehouse_info = get_lakehouse_sql_connection_string(workspace_id, lakehouse_id)
        if not lakehouse_info:
            return "Error: Could not get lakehouse SQL connection information"
        
        lakehouse_info_dict = json.loads(lakehouse_info)
        server_name = lakehouse_info_dict.get("sql_endpoint", {}).get("server_name")
        lakehouse_name = lakehouse_info_dict.get("lakehouse_name")
        
        if not server_name:
            return "Error: Could not extract server name from lakehouse connection info"
        
        if not lakehouse_name:
            return "Error: Could not extract lakehouse name from lakehouse connection info"
        
        # Query to get all user tables with their schemas
        sql_query = """
        SELECT 
            TABLE_SCHEMA,
            TABLE_NAME,
            TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE' 
        AND TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA', 'sys', 'db_accessadmin', 'db_backupoperator', 
                                'db_datareader', 'db_datawriter', 'db_ddladmin', 'db_denydatareader', 
                                'db_denydatawriter', 'db_owner', 'db_securityadmin', 'guest', 'queryinsights')
        ORDER BY TABLE_SCHEMA, TABLE_NAME
        """
        
        # Use pyodbc to connect to the SQL Analytics Endpoint
        try:
            import pyodbc
        except ImportError:
            return "Error: pyodbc module is required for SQL Analytics Endpoint queries but is not installed"
        
        # Get access token for Azure SQL connection - use same token manager as the main function
        from core.azure_token_manager import get_cached_azure_token
        token_struct, success, error = get_cached_azure_token("https://database.windows.net/.default")
        if not success:
            return f"Error: Authentication failed: {error}"
        
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
            return f"Error: No compatible ODBC driver found. Available drivers: {list(available_pyodbc_drivers)}"
        
        # Connection string for Azure SQL with access token - use lakehouse_name as database
        connection_string = (
            f"Driver={{{available_driver}}};"
            f"Server={server_name};"
            f"Database={lakehouse_name};"
            f"Encrypt=yes;"
            f"TrustServerCertificate=yes;"
            f"Connection Timeout=30;"
        )
        
        # Execute the query
        try:
            # Connect using access token authentication
            with pyodbc.connect(connection_string, attrs_before={1256: token_struct}) as conn:
                cursor = conn.cursor()
                cursor.execute(sql_query)
                
                # Fetch results and format as list of dictionaries
                columns = [column[0] for column in cursor.description]
                tables = []
                for row in cursor.fetchall():
                    table_info = dict(zip(columns, row))
                    # Add additional information to match the expected format
                    table_info['id'] = f"{table_info['TABLE_SCHEMA']}.{table_info['TABLE_NAME']}"
                    table_info['type'] = 'Delta'
                    table_info['format'] = 'Delta'
                    table_info['displayName'] = f"{table_info['TABLE_SCHEMA']}.{table_info['TABLE_NAME']}"
                    tables.append(table_info)
                
                if not tables:
                    return "No tables found in this schema-enabled lakehouse"
                
                return json.dumps(tables, indent=2)
                
        except pyodbc.Error as e:
            return f"Error connecting to SQL Analytics Endpoint: {str(e)}"
        
    except Exception as e:
        return f"Error querying SQL endpoint for schema-enabled lakehouse: {str(e)}"

def list_lakehouse_files(workspace_id: str, lakehouse_id: str = None) -> str:
    """Lists all files in the Files section of a specified Fabric Lakehouse.
    
    Args:
        workspace_id (str): The unique identifier of the Fabric workspace
        lakehouse_id (str, optional): The unique identifier of the Lakehouse. If not provided, will use first lakehouse.
        
    Returns:
        str: JSON string containing file information or error message
    """
    import requests
    
    # Input validation - ensure workspace_id is provided and not empty
    if not workspace_id or not workspace_id.strip():
        return "Error: Workspace ID is required and cannot be empty"
    
    try:
        # Get authentication token for Fabric API access
        access_token = get_access_token()
        if not access_token:
            return "Error: No valid access token available"
        
        # Set up authorization header with Bearer token
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # If no lakehouse_id provided, list all lakehouses in the workspace first
        if not lakehouse_id:
            # List all lakehouses in the workspace
            lakehouses_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses"
            lakehouses_response = requests.get(lakehouses_url, headers=headers, timeout=30)
            
            if lakehouses_response.status_code != 200:
                return f"Error listing lakehouses: HTTP {lakehouses_response.status_code} - {lakehouses_response.text}"
            
            lakehouses = lakehouses_response.json().get("value", [])
            if not lakehouses:
                return "No lakehouses found in this workspace."
            
            # For simplicity, use the first lakehouse if multiple exist
            lakehouse_id = lakehouses[0].get("id")
            if not lakehouse_id:
                return "Error: No valid lakehouse ID found"
        
        # Try different API endpoints to see if files are present
        endpoints_to_try = [
            f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses/{lakehouse_id.strip()}/files",
            f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses/{lakehouse_id.strip()}/items",
            f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/items"
        ]
        
        results = {}
        for endpoint in endpoints_to_try:
            try:
                response = requests.get(endpoint, headers=headers, timeout=30)
                results[endpoint] = {
                    "status_code": response.status_code,
                    "response": response.json() if response.status_code == 200 else response.text[:200]
                }
            except Exception as e:
                results[endpoint] = {"error": str(e)}
        
        return json.dumps(results, indent=2)
            
    except Exception as e:
        return f"Error: Unexpected error occurred - {str(e)}"

def get_lakehouse_sql_connection_string(workspace_id: str, lakehouse_id: str = None, lakehouse_name: str = None) -> str:
    """Gets the SQL endpoint connection string for a specified Fabric Lakehouse.
    
    Args:
        workspace_id (str): The unique identifier of the Fabric workspace
        lakehouse_id (str, optional): The unique identifier of the Lakehouse
        lakehouse_name (str, optional): The display name of the Lakehouse
        
    Returns:
        str: JSON string containing SQL endpoint connection information or error message
    """
    import requests
    
    # Input validation - ensure workspace_id is provided and not empty
    if not workspace_id or not workspace_id.strip():
        return "Error: Workspace ID is required and cannot be empty"
    
    # Need either lakehouse_id or lakehouse_name
    if not lakehouse_id and not lakehouse_name:
        return "Error: Either lakehouse_id or lakehouse_name must be provided"
    
    try:
        # Get authentication token for Fabric API access
        access_token = get_access_token()
        if not access_token:
            return "Error: No valid access token available"
        
        # Set up authorization header with Bearer token
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # If lakehouse_name is provided but not lakehouse_id, find the lakehouse by name
        if lakehouse_name and not lakehouse_id:
            # List all lakehouses in the workspace to find the one with matching name
            lakehouses_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses"
            lakehouses_response = requests.get(lakehouses_url, headers=headers, timeout=30)
            
            if lakehouses_response.status_code != 200:
                return f"Error listing lakehouses: HTTP {lakehouses_response.status_code} - {lakehouses_response.text}"
            
            lakehouses = lakehouses_response.json().get("value", [])
            if not lakehouses:
                return "No lakehouses found in this workspace."
            
            # Find lakehouse by name (case-insensitive)
            lakehouse_found = None
            for lh in lakehouses:
                if lh.get("displayName", "").lower() == lakehouse_name.lower():
                    lakehouse_found = lh
                    lakehouse_id = lh.get("id")
                    break
            
            if not lakehouse_found:
                available_names = [lh.get("displayName", "Unknown") for lh in lakehouses]
                return f"Lakehouse '{lakehouse_name}' not found. Available lakehouses: {', '.join(available_names)}"
        
        # Get specific lakehouse details to extract SQL endpoint information
        lakehouse_url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses/{lakehouse_id.strip()}"
        response = requests.get(lakehouse_url, headers=headers, timeout=30)
        
        # Handle different HTTP status codes
        if response.status_code == 200:
            lakehouse_data = response.json()
            
            # Extract SQL endpoint properties
            properties = lakehouse_data.get("properties", {})
            sql_endpoint_props = properties.get("sqlEndpointProperties", {})
            
            if not sql_endpoint_props:
                return f"No SQL endpoint found for lakehouse '{lakehouse_data.get('displayName', lakehouse_id)}'"
            
            # Extract connection information
            connection_info = {
                "lakehouse_name": lakehouse_data.get("displayName"),
                "lakehouse_id": lakehouse_data.get("id"),
                "workspace_id": workspace_id,
                "sql_endpoint": {
                    "connection_string": sql_endpoint_props.get("connectionString"),
                    "endpoint_id": sql_endpoint_props.get("id"),
                    "provisioning_status": sql_endpoint_props.get("provisioningStatus"),
                    "server_name": sql_endpoint_props.get("connectionString"),  # The connection string IS the server name
                }
            }
            
            # Add formatted connection strings for different use cases
            server_name = sql_endpoint_props.get("connectionString")
            if server_name:
                connection_info["connection_strings"] = {
                    "server_only": server_name,
                    "trusted_connection": f"Server={server_name};Integrated Security=SSPI;",
                    "sql_auth_template": f"Server={server_name};Database={{database_name}};User ID={{username}};Password={{password}};",
                    "azure_ad_template": f"Server={server_name};Database={{database_name}};Authentication=Active Directory Integrated;",
                    "connection_string_template": f"Data Source={server_name};Initial Catalog={{database_name}};Integrated Security=True;"
                }
            
            return json.dumps(connection_info, indent=2)
            
        elif response.status_code == 401:
            return "Error: Unauthorized - Invalid or expired access token"
        elif response.status_code == 403:
            return "Error: Forbidden - You don't have permission to access this lakehouse"
        elif response.status_code == 404:
            return f"Error: Lakehouse with ID '{lakehouse_id}' not found in workspace '{workspace_id}'"
        else:
            return f"Error: HTTP {response.status_code} - {response.text}"
            
    except requests.exceptions.Timeout:
        return "Error: Request timed out - Please try again"
    except requests.exceptions.ConnectionError:
        return "Error: Connection failed - Check your internet connection"
    except requests.exceptions.RequestException as e:
        return f"Error: Request failed - {str(e)}"
    except json.JSONDecodeError:
        return "Error: Invalid JSON response from Fabric API"
    except Exception as e:
        return f"Error: Unexpected error occurred - {str(e)}"

def list_lakehouses(workspace_id: str) -> str:
    """Lists all lakehouses in a specified Fabric workspace.
    
    Args:
        workspace_id (str): The unique identifier of the Fabric workspace
        
    Returns:
        str: JSON string containing lakehouse information or error message
    """
    import requests
    
    # Input validation - ensure workspace_id is provided and not empty
    if not workspace_id or not workspace_id.strip():
        return "Error: Workspace ID is required and cannot be empty"
    
    try:
        # Get authentication token for Fabric API access
        access_token = get_access_token()
        if not access_token:
            return "Error: No valid access token available"
        
        # Construct API endpoint URL for listing lakehouses
        url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id.strip()}/lakehouses"
        
        # Set up authorization header with Bearer token
        headers = {"Authorization": f"Bearer {access_token}"}
        
        # Make the API request with 30-second timeout to prevent hanging
        response = requests.get(url, headers=headers, timeout=30)
        
        # Handle different HTTP status codes with specific error messages
        if response.status_code == 200:
            # Success - parse the JSON response
            lakehouses = response.json().get("value", [])
            if not lakehouses:
                return "No lakehouses found in this workspace."
            # Return formatted JSON with proper indentation
            return json.dumps(lakehouses, indent=2)
        elif response.status_code == 401:
            # Authentication failed - token is invalid or expired
            return "Error: Unauthorized - Invalid or expired access token"
        elif response.status_code == 403:
            # Authorization failed - user doesn't have permission
            return "Error: Forbidden - You don't have permission to access this workspace"
        elif response.status_code == 404:
            # Workspace not found
            return f"Error: Workspace with ID '{workspace_id}' not found"
        elif response.status_code == 429:
            # Rate limiting - too many requests
            return "Error: Too many requests - Please try again later"
        else:
            # Other HTTP errors - return status code and response text
            return f"Error: HTTP {response.status_code} - {response.text}"
            
    # Handle specific request exceptions with informative error messages
    except requests.exceptions.Timeout:
        # Request took longer than 30 seconds
        return "Error: Request timed out - Please try again"
    except requests.exceptions.ConnectionError:
        # Network connectivity issues
        return "Error: Connection failed - Check your internet connection"
    except requests.exceptions.RequestException as e:
        # Other request-related errors
        return f"Error: Request failed - {str(e)}"
    except json.JSONDecodeError:
        # Invalid JSON response from API
        return "Error: Invalid JSON response from Fabric API"
    except Exception as e:
        # Catch-all for any unexpected errors
        return f"Error: Unexpected error occurred - {str(e)}"
