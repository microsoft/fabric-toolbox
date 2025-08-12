"""
Power BI Desktop Tools for Semantic Model MCP Server

This module contains all Power BI Desktop related MCP tools for connecting to
and analyzing local Power BI Desktop instances.
"""

from fastmcp import FastMCP
import json
from tools.powerbi_desktop_detector import detect_powerbi_desktop_instances, test_powerbi_desktop_connection
from tools.improved_dax_explorer import get_local_tmsl_definition, update_local_model_using_tmsl
from tools.simple_dax_explorer import explore_local_powerbi_simple, execute_local_dax_query

def register_powerbi_desktop_tools(mcp: FastMCP):
    """Register all Power BI Desktop related MCP tools"""

    @mcp.tool
    def detect_local_powerbi_desktop() -> str:
        """Detect running Power BI Desktop instances and their Analysis Services connection information.

        This tool scans for running Power BI Desktop processes and their associated Analysis Services 
        instances to enable local development and testing scenarios.

        Returns:
            JSON string containing:
            - List of Power BI Desktop instances with process information
            - Analysis Services instances and their port numbers  
            - Connection strings for local development
            - Instructions for connecting to local instances
        """
        try:
            result = detect_powerbi_desktop_instances()
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error detecting Power BI Desktop instances: {str(e)}',
                'error_type': 'powerbi_detection_error'
            })

    @mcp.tool
    def test_local_powerbi_connection(port: int) -> str:
        """Test connection to a local Power BI Desktop Analysis Services instance.

        This tool attempts to connect to a Power BI Desktop Analysis Services instance
        running on the specified port and validates the connection.

        Args:
            port: The port number where Analysis Services is running (typically > 50000)
            
        Returns:
            JSON string with connection test results including:
            - Success/failure status
            - Connection string used
            - Server properties if connection successful
            - Error details if connection failed
        """
        try:
            result = test_powerbi_desktop_connection(port)
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error testing Power BI Desktop connection: {str(e)}',
                'error_type': 'powerbi_connection_error'
            })

    @mcp.tool
    def explore_local_powerbi_tables(connection_string: str) -> str:
        """Explore tables in a local Power BI Desktop model.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance
            
        Returns:
            JSON string with table information including names, row counts, and basic metadata
        """
        try:
            result = explore_local_powerbi_simple(connection_string, 'tables')
            return result
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error exploring local Power BI tables: {str(e)}',
                'error_type': 'powerbi_tables_error'
            })

    @mcp.tool
    def explore_local_powerbi_columns(connection_string: str, table_name: str = None) -> str:
        """Explore columns in a local Power BI Desktop model.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance
            table_name: Optional specific table name to explore columns for
            
        Returns:
            JSON string with column information including names, data types, and properties
        """
        try:
            operation = f'columns:{table_name}' if table_name else 'columns'
            result = explore_local_powerbi_simple(connection_string, operation)
            return result
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error exploring local Power BI columns: {str(e)}',
                'error_type': 'powerbi_columns_error'
            })

    @mcp.tool
    def explore_local_powerbi_measures(connection_string: str) -> str:
        """Explore measures in a local Power BI Desktop model.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance
            
        Returns:
            JSON string with measure information including names, expressions, and properties
        """
        try:
            result = explore_local_powerbi_simple(connection_string, 'measures')
            return result
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error exploring local Power BI measures: {str(e)}',
                'error_type': 'powerbi_measures_error'
            })

    @mcp.tool
    def execute_local_powerbi_dax(connection_string: str, dax_query: str) -> str:
        """Execute a DAX query against a local Power BI Desktop model.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance
            dax_query: The DAX query to execute
            
        Returns:
            JSON string with query results including columns and data
        """
        try:
            result = execute_local_dax_query(connection_string, dax_query)
            return result
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error executing local Power BI DAX query: {str(e)}',
                'error_type': 'powerbi_dax_error'
            })

    @mcp.tool
    def query_local_powerbi_table(connection_string: str, table_name: str, max_rows: int = 10) -> str:
        """Query data from a specific table in a local Power BI Desktop model.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance
            table_name: The name of the table to query
            max_rows: Maximum number of rows to return (default: 10)
            
        Returns:
            JSON string with table data including columns and sample rows
        """
        try:
            # Construct a simple DAX query to get table data
            dax_query = f"EVALUATE TOPN({max_rows}, '{table_name}')"
            result = execute_local_dax_query(connection_string, dax_query)
            
            # Parse the result and add table context
            result_data = json.loads(result)
            if result_data.get('success'):
                result_data['table_name'] = table_name
                result_data['max_rows_requested'] = max_rows
                result_data['query_type'] = 'table_sample'
            
            return json.dumps(result_data, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error querying local Power BI table: {str(e)}',
                'error_type': 'powerbi_table_query_error'
            })

    @mcp.tool
    def explore_local_powerbi_model_structure(connection_string: str) -> str:
        """Get comprehensive structure information about a local Power BI Desktop model.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance
            
        Returns:
            JSON string with complete model structure including tables, columns, measures, and relationships
        """
        try:
            # Get tables
            tables_result = explore_local_powerbi_simple(connection_string, 'tables')
            tables_data = json.loads(tables_result)
            
            # Get measures
            measures_result = explore_local_powerbi_simple(connection_string, 'measures')
            measures_data = json.loads(measures_result)
            
            # Get all columns
            columns_result = explore_local_powerbi_simple(connection_string, 'columns')
            columns_data = json.loads(columns_result)
            
            # Combine into comprehensive structure
            structure = {
                'success': True,
                'connection_string': connection_string,
                'model_structure': {
                    'tables': tables_data.get('tables', []) if tables_data.get('success') else [],
                    'measures': measures_data.get('measures', []) if measures_data.get('success') else [],
                    'columns': columns_data.get('columns', []) if columns_data.get('success') else []
                },
                'summary': {
                    'table_count': len(tables_data.get('tables', [])) if tables_data.get('success') else 0,
                    'measure_count': len(measures_data.get('measures', [])) if measures_data.get('success') else 0,
                    'column_count': len(columns_data.get('columns', [])) if columns_data.get('success') else 0
                }
            }
            
            return json.dumps(structure, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error exploring local Power BI model structure: {str(e)}',
                'error_type': 'powerbi_structure_error'
            })

    @mcp.tool
    def get_local_powerbi_tmsl_definition(connection_string: str) -> str:
        """Gets TMSL definition for a local Power BI Desktop Analysis Services Model.
        
        This tool connects to a local Power BI Desktop instance, retrieves the model definition,
        and returns the TMSL definition as a string.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance (e.g., "Data Source=localhost:51542")
            
        Returns:
            JSON string with TMSL definition and model metadata
        """
        try:
            result = get_local_tmsl_definition(connection_string)
            return result
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error getting local Power BI TMSL definition: {str(e)}',
                'error_type': 'tmsl_retrieval_error'
            })

    @mcp.tool
    def update_local_powerbi_tmsl_definition(connection_string: str, tmsl_definition: str, validate_only: bool = False) -> str:
        """Updates the TMSL definition for a local Power BI Desktop Analysis Services Model.
        
        This tool connects to a local Power BI Desktop instance, validates and updates the TMSL definition,
        and returns a success message or detailed error information if the update fails.
        
        Args:
            connection_string: The connection string to the local Power BI Desktop instance (e.g., "Data Source=localhost:51542")
            tmsl_definition: Valid TMSL JSON string in createOrReplace format
            validate_only: If True, only validates the TMSL without executing (default: False)
        
        Returns:
            Success message or detailed error with suggestions for fixes
        """
        try:
            result = update_local_model_using_tmsl(connection_string, tmsl_definition, validate_only)
            return result
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error updating local Power BI Desktop model: {str(e)}',
                'error_type': 'tmsl_update_error'
            })

    @mcp.tool
    def compare_analysis_services_connections() -> str:
        """Compare different types of Analysis Services connections and their requirements.
        
        This tool provides detailed information about connecting to:
        - Power BI Desktop (local, no authentication)
        - Power BI Service (cloud, token-based authentication)  
        - Analysis Services (on-premises/Azure, Windows/SQL authentication)
        
        Returns:
            JSON string with comprehensive comparison of connection types,
            authentication requirements, use cases, and implementation examples
        """
        try:
            result = {
                'success': True,
                'connection_types': {
                    'power_bi_desktop': {
                        'complexity': 'Very Simple',
                        'authentication': 'None',
                        'example': 'Data Source=localhost:51542',
                        'best_for': 'Development and testing',
                        'description': 'Direct connection to local Analysis Services instance'
                    },
                    'power_bi_service': {
                        'complexity': 'Complex',
                        'authentication': 'Access Token Required',
                        'example': 'Data Source=powerbi://api.powerbi.com/v1.0/myorg/workspace;Initial Catalog=dataset;User ID=app:id@tenant;Password=token',
                        'best_for': 'Production and collaboration',
                        'description': 'Cloud-based connection requiring Azure AD authentication'
                    },
                    'analysis_services': {
                        'complexity': 'Moderate',
                        'authentication': 'Windows/SQL Authentication',
                        'example': 'Data Source=server;Initial Catalog=database;Integrated Security=SSPI',
                        'best_for': 'Enterprise and on-premises',
                        'description': 'Traditional Analysis Services connection'
                    }
                },
                'key_differences': {
                    'authentication_complexity': {
                        'power_bi_desktop': 'No authentication needed - runs under user context',
                        'power_bi_service': 'Requires Azure AD token with Power BI permissions',
                        'analysis_services': 'Requires Windows or SQL Server authentication'
                    },
                    'network_requirements': {
                        'power_bi_desktop': 'Localhost only - no network connectivity required',
                        'power_bi_service': 'Internet connection required for API access',
                        'analysis_services': 'Network access to server required'
                    },
                    'use_case_scenarios': {
                        'power_bi_desktop': 'Local development, debugging, testing before publish',
                        'power_bi_service': 'Published models, shared datasets, production environments',
                        'analysis_services': 'Enterprise tabular models, on-premises or Azure AS'
                    }
                },
                'implementation_tips': {
                    'power_bi_desktop': [
                        'Use automatic detection to find running instances',
                        'No credential management needed',
                        'Perfect for iterative development',
                        'Test frequently during model development'
                    ],
                    'power_bi_service': [
                        'Implement token refresh mechanisms',
                        'Handle authentication errors gracefully',
                        'Cache connections when possible',
                        'Monitor token expiration'
                    ],
                    'analysis_services': [
                        'Use connection pooling for performance',
                        'Implement proper error handling',
                        'Monitor connection health',
                        'Use Windows Authentication when possible'
                    ]
                }
            }
            
            return json.dumps(result, indent=2)
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error comparing connection types: {str(e)}',
                'error_type': 'connection_comparison_error'
            })
