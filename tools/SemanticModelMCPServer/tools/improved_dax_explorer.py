"""
Improved DAX explorer for local Power BI Desktop with better error handling and table reference support.

Based on Microsoft Learn best practices for DAX queries and table references.
References:
- https://learn.microsoft.com/en-us/dax/topn-function-dax
- https://learn.microsoft.com/en-us/power-bi/transform-model/dax-query-view
- https://learn.microsoft.com/en-us/dax/dax-syntax-reference
"""

import json
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)

class ImprovedDAXExplorer:
    """
    Enhanced DAX explorer with better error handling and table reference support.
    """
    
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        
    def _safe_execute_dax(self, dax_query: str) -> Dict[str, Any]:
        """
        Safely execute a DAX query with comprehensive error handling.
        
        Args:
            dax_query: DAX query to execute
            
        Returns:
            Dictionary with execution results or error information
        """
        try:
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Connect to local Power BI Desktop
            conn = AdomdConnection(self.connection_string)
            conn.Open()
            
            try:
                # Execute DAX query
                cmd = conn.CreateCommand()
                cmd.CommandText = dax_query
                
                reader = cmd.ExecuteReader()
                
                # Get column information
                columns = []
                for i in range(reader.FieldCount):
                    columns.append({
                        'name': reader.GetName(i),
                        'index': i,
                        'type': str(reader.GetFieldType(i)) if reader.GetFieldType(i) else 'Unknown'
                    })
                
                # Read data rows with improved error handling
                rows = []
                row_count = 0
                max_rows = 1000  # Safety limit to prevent memory issues
                
                while reader.Read() and row_count < max_rows:
                    row = {}
                    for i in range(reader.FieldCount):
                        column_name = reader.GetName(i)
                        try:
                            value = reader[i]
                            if value is None:
                                row[column_name] = None
                            elif hasattr(value, 'isoformat'):  # DateTime objects
                                row[column_name] = value.isoformat()
                            else:
                                row[column_name] = str(value)
                        except Exception as col_error:
                            logger.warning(f"Error reading column {column_name}: {str(col_error)}")
                            row[column_name] = f"<read_error: {str(col_error)}>"
                    
                    rows.append(row)
                    row_count += 1
                
                reader.Close()
                conn.Close()
                
                return {
                    'success': True,
                    'connection_string': self.connection_string,
                    'dax_query': dax_query,
                    'columns': columns,
                    'total_rows': row_count,
                    'rows': rows,
                    'truncated': row_count >= max_rows,
                    'method': 'Improved DAX execution'
                }
                
            except Exception as query_error:
                conn.Close()
                error_msg = str(query_error)
                logger.error(f"DAX query execution error: {error_msg}")
                
                # Provide helpful error suggestions
                suggestions = self._analyze_dax_error(error_msg, dax_query)
                
                return {
                    'success': False,
                    'error': error_msg,
                    'error_type': 'query_execution',
                    'suggestions': suggestions,
                    'dax_query': dax_query,
                    'connection_string': self.connection_string
                }
                
        except Exception as connection_error:
            error_msg = str(connection_error)
            logger.error(f"Connection error: {error_msg}")
            
            return {
                'success': False,
                'error': error_msg,
                'error_type': 'connection_error',
                'suggestions': [
                    "Verify Power BI Desktop is running",
                    "Check if the port number is correct",
                    "Ensure the connection string format is valid"
                ],
                'connection_string': self.connection_string
            }
    
    def _analyze_dax_error(self, error_msg: str, dax_query: str) -> List[str]:
        """
        Analyze DAX error and provide helpful suggestions.
        
        Args:
            error_msg: Error message from DAX execution
            dax_query: The DAX query that failed
            
        Returns:
            List of suggestion strings
        """
        suggestions = []
        error_lower = error_msg.lower()
        
        # Table reference issues
        if "table" in error_lower and ("not found" in error_lower or "doesn't exist" in error_lower):
            suggestions.extend([
                "Check table name spelling and case sensitivity",
                "Use 'INFO.TABLES()' to see available tables",
                "Ensure table name matches exactly as shown in Power BI"
            ])
        
        # Column reference issues  
        if "column" in error_lower and ("not found" in error_lower or "doesn't exist" in error_lower):
            suggestions.extend([
                "Check column name spelling and case sensitivity",
                "Use 'INFO.COLUMNS()' to see available columns",
                "Try using table[column] syntax instead of just column name"
            ])
        
        # Syntax issues
        if "syntax" in error_lower:
            suggestions.extend([
                "Check DAX syntax - ensure EVALUATE is used for table expressions",
                "Verify parentheses and brackets are properly matched",
                "Check function parameter count and types"
            ])
        
        # Function issues
        if "function" in error_lower:
            suggestions.extend([
                "Verify function name spelling",
                "Check function parameter types and count",
                "Some functions may not be available in Power BI Desktop"
            ])
        
        # Table reference in queries
        if "TOPN" in dax_query.upper() or "EVALUATE" in dax_query.upper():
            # Check if table name is properly referenced
            if not any(word in dax_query for word in ["'", "[", "INFO."]):
                suggestions.append("Try wrapping table name in single quotes like 'TableName' or use bracket notation")
        
        if not suggestions:
            suggestions.extend([
                "Check DAX syntax and function usage",
                "Verify all table and column references exist",
                "Try simplifying the query to isolate the issue"
            ])
        
        return suggestions
    
    def execute_table_query(self, table_name: str, max_rows: int = 10) -> Dict[str, Any]:
        """
        Execute a simple table query with proper table reference handling.
        
        Args:
            table_name: Name of the table to query
            max_rows: Maximum number of rows to return
            
        Returns:
            Dictionary with query results
        """
        # Try different table reference formats
        table_formats = [
            table_name,                    # Direct name
            f"'{table_name}'",            # Single quotes
            f"[{table_name}]",            # Brackets
        ]
        
        for table_ref in table_formats:
            dax_query = f"""
EVALUATE
TOPN({max_rows}, {table_ref})
"""
            
            result = self._safe_execute_dax(dax_query.strip())
            
            if result.get('success'):
                result['table_reference_used'] = table_ref
                result['table_name'] = table_name
                return result
            else:
                # Log this attempt but continue to next format
                logger.debug(f"Table reference '{table_ref}' failed: {result.get('error', 'Unknown error')}")
        
        # If all formats failed, return the last error with additional context
        return {
            'success': False,
            'error': f"Could not query table '{table_name}' with any reference format",
            'error_type': 'table_reference_error',
            'attempted_formats': table_formats,
            'last_error': result.get('error', 'Unknown error'),
            'suggestions': [
                f"Verify table '{table_name}' exists using INFO.TABLES()",
                "Check if table name has special characters or spaces",
                "Try browsing available tables first"
            ]
        }
    
    def get_available_tables(self) -> Dict[str, Any]:
        """
        Get list of available tables using INFO.TABLES().
        
        Returns:
            Dictionary with table information
        """
        dax_query = "EVALUATE INFO.TABLES()"
        return self._safe_execute_dax(dax_query)
    
    def get_table_columns(self, table_name: str = None) -> Dict[str, Any]:
        """
        Get column information for tables.
        
        Args:
            table_name: Optional table name to filter columns
            
        Returns:
            Dictionary with column information
        """
        if table_name:
            dax_query = f"EVALUATE FILTER(INFO.COLUMNS(), [Table Name] = \"{table_name}\")"
        else:
            dax_query = "EVALUATE INFO.COLUMNS()"
        
        return self._safe_execute_dax(dax_query)
    
    def test_connection(self) -> Dict[str, Any]:
        """
        Test the connection with a simple query.
        
        Returns:
            Dictionary with connection test results
        """
        test_query = "EVALUATE { 1 }"
        result = self._safe_execute_dax(test_query)
        
        if result.get('success'):
            return {
                'success': True,
                'message': 'Connection test successful',
                'connection_string': self.connection_string
            }
        else:
            return {
                'success': False,
                'message': 'Connection test failed',
                'error': result.get('error'),
                'connection_string': self.connection_string
            }


def execute_improved_dax_query(connection_string: str, dax_query: str) -> str:
    """
    Execute a DAX query using the improved explorer.
    
    Args:
        connection_string: Connection string for local Power BI Desktop
        dax_query: DAX query to execute
        
    Returns:
        JSON string with query results
    """
    try:
        explorer = ImprovedDAXExplorer(connection_string)
        result = explorer._safe_execute_dax(dax_query)
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error in improved DAX query execution: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'error_type': 'explorer_error',
            'connection_string': connection_string,
            'dax_query': dax_query
        }, indent=2)


def query_table_safely(connection_string: str, table_name: str, max_rows: int = 10) -> str:
    """
    Safely query a table with automatic table reference handling.
    
    Args:
        connection_string: Connection string for local Power BI Desktop
        table_name: Name of the table to query
        max_rows: Maximum number of rows to return
        
    Returns:
        JSON string with query results
    """
    try:
        explorer = ImprovedDAXExplorer(connection_string)
        result = explorer.execute_table_query(table_name, max_rows)
        return json.dumps(result, indent=2)
        
    except Exception as e:
        logger.error(f"Error in safe table query: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'error_type': 'table_query_error',
            'table_name': table_name,
            'connection_string': connection_string
        }, indent=2)


def explore_model_structure(connection_string: str) -> str:
    """
    Explore the model structure (tables, columns) safely.
    
    Args:
        connection_string: Connection string for local Power BI Desktop
        
    Returns:
        JSON string with model structure information
    """
    try:
        explorer = ImprovedDAXExplorer(connection_string)
        
        # Get tables
        tables_result = explorer.get_available_tables()
        
        if not tables_result.get('success'):
            return json.dumps(tables_result, indent=2)
        
        # Get columns 
        columns_result = explorer.get_table_columns()
        
        return json.dumps({
            'success': True,
            'connection_string': connection_string,
            'tables': tables_result,
            'columns': columns_result,
            'method': 'Model structure exploration'
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error exploring model structure: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'error_type': 'structure_exploration_error',
            'connection_string': connection_string
        }, indent=2)


def get_local_tmsl_definition(connection_string: str) -> str:
    """
    Get the TMSL (Tabular Model Scripting Language) definition from a local Power BI Desktop instance.
    
    This function uses the Analysis Services Tabular Object Model to connect to a local
    Power BI Desktop instance and retrieve the complete model definition in TMSL format.
    
    Args:
        connection_string: Local connection string (e.g., "Data Source=localhost:51542")
        
    Returns:
        JSON string containing:
        - TMSL definition if successful
        - Error information if failed
        - Connection details and metadata
    """
    try:
        import clr
        import os
        
        # Add references to Analysis Services libraries
        current_dir = os.path.dirname(os.path.abspath(__file__))
        dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
        
        # Load required assemblies for TMSL operations
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
        from Microsoft.AnalysisServices.Tabular import Server, Database, JsonSerializer, SerializeOptions
        
        # Connect to local Power BI Desktop
        server = Server()
        server.Connect(connection_string)
        
        try:
            # Get the database (there should be only one in Power BI Desktop)
            databases = server.Databases
            if databases.Count == 0:
                return json.dumps({
                    'success': False,
                    'error': 'No databases found in the local Power BI Desktop instance',
                    'connection_string': connection_string,
                    'error_type': 'no_databases'
                }, indent=2)
            
            # Get the first (and typically only) database
            database = databases[0]
            database_name = database.Name
            
            # Configure serialization options
            options = SerializeOptions()
            options.IgnoreTimestamps = True  # Exclude timestamps for cleaner output
            
            # Serialize the database to TMSL JSON
            tmsl_definition = JsonSerializer.SerializeDatabase(database, options)
            
            # Get additional metadata
            server_info = {
                'server_name': server.Name if server.Name else 'localhost',
                'server_version': server.Version if hasattr(server, 'Version') else 'Unknown',
                'database_name': database_name,
                'database_id': database.ID if database.ID else 'Unknown',
                'compatibility_level': database.CompatibilityLevel if hasattr(database, 'CompatibilityLevel') else 'Unknown',
                'last_processed': str(database.LastProcessed) if hasattr(database, 'LastProcessed') else 'Unknown',
                'last_update': str(database.LastUpdate) if hasattr(database, 'LastUpdate') else 'Unknown'
            }
            
            # Count model objects
            model_stats = {
                'tables': database.Model.Tables.Count if database.Model and database.Model.Tables else 0,
                'measures': sum(table.Measures.Count for table in database.Model.Tables) if database.Model and database.Model.Tables else 0,
                'columns': sum(table.Columns.Count for table in database.Model.Tables) if database.Model and database.Model.Tables else 0,
                'relationships': database.Model.Relationships.Count if database.Model and database.Model.Relationships else 0
            }
            
            server.Disconnect()
            
            return json.dumps({
                'success': True,
                'connection_string': connection_string,
                'server_info': server_info,
                'model_statistics': model_stats,
                'tmsl_definition': tmsl_definition,
                'retrieval_method': 'Local Power BI Desktop TMSL extraction',
                'message': f'Successfully retrieved TMSL definition for database "{database_name}"'
            }, indent=2)
            
        except Exception as db_error:
            server.Disconnect()
            error_msg = str(db_error)
            logger.error(f"Error accessing database: {error_msg}")
            
            return json.dumps({
                'success': False,
                'error': error_msg,
                'error_type': 'database_access_error',
                'connection_string': connection_string,
                'suggestions': [
                    'Verify the Power BI Desktop instance is fully loaded',
                    'Check if the model is not in an error state',
                    'Ensure the connection string port is correct',
                    'Try refreshing the model in Power BI Desktop'
                ]
            }, indent=2)
            
    except Exception as connection_error:
        error_msg = str(connection_error)
        logger.error(f"Connection error getting TMSL: {error_msg}")
        
        return json.dumps({
            'success': False,
            'error': error_msg,
            'error_type': 'connection_error',
            'connection_string': connection_string,
            'suggestions': [
                'Verify Power BI Desktop is running with a file open',
                'Check if the port number is correct',
                'Ensure the Analysis Services instance is accessible',
                'Try detecting local instances first to get the correct port'
            ]
        }, indent=2)


def update_local_model_using_tmsl(connection_string: str, tmsl_definition: str, validate_only: bool = False) -> str:
    """Updates the TMSL definition for a local Power BI Desktop Analysis Services Model.
    
    This function connects to a local Power BI Desktop instance, validates and updates the TMSL definition,
    and returns a success message or detailed error information if the update fails.
    
    Args:
        connection_string: The connection string to the local Power BI Desktop instance (e.g., "Data Source=localhost:51542")
        tmsl_definition: Valid TMSL JSON string in createOrReplace format
        validate_only: If True, only validates the TMSL without executing (default: False)
    
    Returns:
        JSON string with success message or detailed error with suggestions for fixes
    """
    import json
    import logging
    import os
    import clr
    
    logger = logging.getLogger(__name__)
    
    try:
        # Load and import the necessary .NET assemblies
        script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        dotnet_dir = os.path.join(script_dir, "dotnet")
        
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.dll"))
        clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
        
        from Microsoft.AnalysisServices.Tabular import Server  # type: ignore
        from Microsoft.AnalysisServices import XmlaResultCollection  # type: ignore
        import System  # type: ignore
        
        # Validate TMSL structure
        try:
            tmsl_obj = json.loads(tmsl_definition)
            
            # Check if it's in the correct createOrReplace format
            if 'createOrReplace' not in tmsl_obj:
                return json.dumps({
                    'success': False,
                    'error': 'TMSL must be in createOrReplace format',
                    'error_type': 'validation_error',
                    'suggestions': [
                        'Ensure TMSL has createOrReplace as top-level key',
                        'Use the format: {"createOrReplace": {"database": {...}}}',
                        'Check the TMSL structure matches expected format'
                    ]
                }, indent=2)
            
            if validate_only:
                return json.dumps({
                    'success': True,
                    'message': 'TMSL validation successful - structure is valid',
                    'connection_string': connection_string,
                    'validation_only': True
                }, indent=2)
                
        except json.JSONDecodeError as json_error:
            return json.dumps({
                'success': False,
                'error': f'Invalid JSON in TMSL definition: {str(json_error)}',
                'error_type': 'json_validation_error',
                'suggestions': [
                    'Check TMSL JSON syntax for missing commas, brackets, or quotes',
                    'Validate JSON structure using a JSON validator',
                    'Ensure all strings are properly quoted'
                ]
            }, indent=2)
        
        # Connect to the local Power BI Desktop instance
        server = Server()
        try:
            logger.info(f"Connecting to local Power BI Desktop: {connection_string}")
            server.Connect(connection_string)
            
            if len(server.Databases) == 0:
                return json.dumps({
                    'success': False,
                    'error': 'No databases found on the server',
                    'error_type': 'database_access_error',
                    'connection_string': connection_string,
                    'suggestions': [
                        'Ensure Power BI Desktop has a file open',
                        'Check that the model is loaded properly',
                        'Verify the connection string is correct'
                    ]
                }, indent=2)
            
            # Execute the TMSL update
            logger.info("Executing TMSL update...")
            
            try:
                # Execute the TMSL command
                results = server.Execute(tmsl_definition)
                
                # Check if execution was successful
                if results and len(results) > 0:
                    # Check for errors in results
                    has_errors = False
                    error_messages = []
                    
                    for i in range(len(results)):
                        result = results[i]
                        if hasattr(result, 'HasErrors') and result.HasErrors:
                            has_errors = True
                            if hasattr(result, 'Messages'):
                                for j in range(len(result.Messages)):
                                    message = result.Messages[j]
                                    error_messages.append(str(message))
                    
                    if has_errors:
                        return json.dumps({
                            'success': False,
                            'error': 'TMSL execution failed with errors',
                            'error_type': 'tmsl_execution_error',
                            'error_messages': error_messages,
                            'connection_string': connection_string,
                            'suggestions': [
                                'Check TMSL syntax and structure',
                                'Verify all referenced objects exist',
                                'Ensure measure expressions are valid DAX',
                                'Check for naming conflicts or reserved words'
                            ]
                        }, indent=2)
                
                # Success!
                return json.dumps({
                    'success': True,
                    'message': 'TMSL update completed successfully',
                    'connection_string': connection_string,
                    'execution_method': 'Local Power BI Desktop TMSL update'
                }, indent=2)
                
            except Exception as tmsl_error:
                error_msg = str(tmsl_error)
                return json.dumps({
                    'success': False,
                    'error': f'TMSL execution error: {error_msg}',
                    'error_type': 'tmsl_execution_error',
                    'connection_string': connection_string,
                    'suggestions': [
                        'Check TMSL syntax is valid',
                        'Verify all table and column references exist',
                        'Ensure DAX expressions in measures are correct',
                        'Check for circular references or dependencies'
                    ]
                }, indent=2)
                
        except Exception as connection_error:
            error_msg = str(connection_error)
            logger.error(f"Connection error in local TMSL update: {error_msg}")
            
            return json.dumps({
                'success': False,
                'error': f'Failed to connect to local Power BI Desktop: {error_msg}',
                'error_type': 'connection_error',
                'connection_string': connection_string,
                'suggestions': [
                    'Verify Power BI Desktop is running with a file open',
                    'Check if the port number is correct',
                    'Ensure the Analysis Services instance is accessible',
                    'Try detecting local instances first to get the correct port'
                ]
            }, indent=2)
            
        finally:
            try:
                if server and server.Connected:
                    server.Disconnect()
            except:
                pass
                
    except Exception as general_error:
        error_msg = str(general_error)
        logger.error(f"General error in local TMSL update: {error_msg}")
        
        return json.dumps({
            'success': False,
            'error': f'Unexpected error: {error_msg}',
            'error_type': 'general_error',
            'connection_string': connection_string,
            'suggestions': [
                'Check if .NET assemblies are properly loaded',
                'Verify Python.NET (pythonnet) is installed correctly',
                'Ensure all required dependencies are available'
            ]
        }, indent=2)
