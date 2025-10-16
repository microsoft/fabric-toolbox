"""Execute lightweight XMLA queries using the bundled ADOMD.NET client."""

import json
import urllib.parse
from typing import Any, Dict, Optional, Tuple

from .auth import force_token_refresh, is_auth_error, get_access_token
from ..config import get_project_root


def is_desktop_connection(xmla_endpoint: str) -> bool:
    """Check if an XMLA endpoint is a local desktop connection."""
    return 'localhost:' in xmla_endpoint.lower()


def build_connection_string(xmla_endpoint: str, dataset_name: Optional[str] = None) -> str:
    """Build connection string for XMLA endpoint with optional dataset catalog.
    
    Args:
        xmla_endpoint: XMLA endpoint URL
        dataset_name: Optional dataset name for Initial Catalog
        
    Returns:
        Connection string with authentication if needed
    """
    is_desktop = is_desktop_connection(xmla_endpoint)
    
    if is_desktop:
        base = f"Data Source={xmla_endpoint};"
        if dataset_name:
            base += f"Initial Catalog={dataset_name};"
        return base
    
    # Service connection requires auth
    token = get_access_token()
    if not token:
        raise ValueError("Authentication required for Power BI Service connection")
    
    base = f"Data Source={xmla_endpoint};"
    if dataset_name:
        base += f"Initial Catalog={dataset_name};"
    base += f"Password={token};"
    return base


def determine_xmla_endpoint(workspace_name: Optional[str], xmla_endpoint: Optional[str]) -> Tuple[str, str]:
    """Resolve the XMLA endpoint and workspace name.
    
    Args:
        workspace_name: Optional workspace name (can also be localhost:port for desktop)
        xmla_endpoint: Optional XMLA endpoint URL
        
    Returns:
        Tuple of (xmla_endpoint, workspace_name)
    """
    if workspace_name:
        if is_desktop_connection(workspace_name):
            return workspace_name, f"Desktop ({workspace_name})"
        
        encoded_workspace_name = urllib.parse.quote(workspace_name)
        xmla_endpoint = f"powerbi://api.powerbi.com/v1.0/myorg/{encoded_workspace_name}"
    else:
        try:
            if is_desktop_connection(xmla_endpoint):
                workspace_name = f"Desktop ({xmla_endpoint})"
            elif "myorg/" in xmla_endpoint:
                encoded_name = xmla_endpoint.split("myorg/")[1]
                workspace_name = urllib.parse.unquote(encoded_name)
            else:
                workspace_name = "Unknown"
        except Exception:
            workspace_name = "Unknown"
    
    return xmla_endpoint, workspace_name


def find_adomd_dll() -> Optional[str]:
    """Return the path to the bundled ADOMD.NET assembly when present, None otherwise."""
    bundled_assembly_path = get_project_root() / "dotnet" / "Microsoft.AnalysisServices.AdomdClient.dll"
    
    if bundled_assembly_path.exists():
        return str(bundled_assembly_path)
    
    return None


def execute_dax_query_direct(
    xmla_endpoint: str,
    dataset_name: str,
    query: str
) -> str:
    """Execute a single DAX query directly against the XMLA endpoint.
    
    Args:
        xmla_endpoint: XMLA endpoint URL
        dataset_name: Dataset name
        query: DAX query to execute
    """
    def _execute_query_internal() -> str:
        """Internal query execution logic"""
        try:
            import clr

            adomd_path = find_adomd_dll()
            if not adomd_path:
                return "Error: Bundled ADOMD.NET assembly not found. Please ensure Microsoft.AnalysisServices.AdomdClient.dll exists in the dotnet directory."

            clr.AddReference(adomd_path)
            from System.Data import DataSet  # type: ignore
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection, AdomdDataAdapter  # type: ignore
            
            connection_string = build_connection_string(xmla_endpoint, dataset_name)
            
            connection = AdomdConnection(connection_string)
            connection.Open()

            command = connection.CreateCommand()
            command.CommandText = query

            adapter = AdomdDataAdapter(command)
            result_dataset = DataSet()
            adapter.Fill(result_dataset)

            results: Dict[str, Any] = {"columns": [], "rows": [], "row_count": 0}
            if result_dataset.Tables.Count > 0:
                table = result_dataset.Tables[0]
                columns = [str(col.ColumnName) for col in table.Columns]
                rows = []
                for row in table.Rows:
                    row_data = {}
                    for column_name in columns:
                        value = row[column_name]
                        # Handle None/null values safely without triggering DateTime comparison
                        if value is None or (isinstance(value, str) and value == ""):
                            row_data[column_name] = None
                        else:
                            try:
                                row_data[column_name] = str(value)
                            except Exception:
                                row_data[column_name] = None
                    rows.append(row_data)

                results = {"columns": columns, "rows": rows, "row_count": len(rows)}

            connection.Close()
            return json.dumps(results, indent=2, default=str)
            
        except Exception as e:
            import traceback
            return f"Error: {e}\nDetails: {traceback.format_exc()}"
    
    result = _execute_query_internal()
    
    if not result.startswith("Error:"):
        return result
    
    if is_desktop_connection(xmla_endpoint):
        return result
    
    if is_auth_error(result):
        if force_token_refresh():
            result = _execute_query_internal()
            if not result.startswith("Error:"):
                return result
            # Still failing after refresh
            if is_auth_error(result):
                return f"Error: Authentication failed even after token refresh. Please run 'clear_authentication_cache' and try again. Details: {result}"
        else:
            return f"Error: Token refresh failed. Please run 'clear_authentication_cache' and 'test_authentication' to re-authenticate. Original error: {result}"
    
    # Non-auth error or failed retry
    return f"Error: DAX query execution failed - {result}"