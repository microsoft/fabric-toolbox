"""
Power BI Desktop Tools for Semantic Model MCP Server

This module contains all Power BI Desktop related MCP tools for connecting to
and analyzing local Power BI Desktop instances.
"""

from fastmcp import FastMCP
import json
from tools.powerbi_desktop_detector import detect_powerbi_desktop_instances, test_powerbi_desktop_connection
from tools.fast_powerbi_detector import detect_powerbi_desktop_instances_fast
from tools.ultra_fast_powerbi_detector import detect_powerbi_desktop_instances_ultra_fast
from tools.improved_dax_explorer import get_local_tmsl_definition, update_local_model_using_tmsl
from tools.simple_dax_explorer import explore_local_powerbi_simple, execute_local_dax_query

def register_powerbi_desktop_tools(mcp: FastMCP):
    """Register all Power BI Desktop related MCP tools"""

    @mcp.tool
    def detect_local_powerbi_desktop() -> str:
        """Detect running Power BI Desktop instances and their Analysis Services connection information.

        This tool scans for running Power BI Desktop processes and their associated Analysis Services 
        instances to enable local development and testing scenarios. Uses optimized fast detection
        methods for improved performance.

        Returns:
            JSON string containing:
            - List of Power BI Desktop instances with process information
            - Analysis Services instances and their port numbers  
            - Connection strings for local development
            - Performance metrics and detection method used
            - Instructions for connecting to local instances
        """
        try:
            # Use the ultra-fast detector for maximum performance
            result = detect_powerbi_desktop_instances_ultra_fast()
            return json.dumps(result, indent=2, default=str)  # Convert dict to JSON string
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error detecting Power BI Desktop instances: {str(e)}',
                'error_type': 'powerbi_detection_error',
                'fallback_attempted': False
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

    @mcp.tool
    def compare_powerbi_detection_methods() -> str:
        """Compare performance between ultra-fast, fast, and standard Power BI Desktop detection methods.
        
        This tool runs all three detection methods (ultra-fast optimized, fast netstat-based, 
        and standard psutil-based) to provide comprehensive performance metrics and validate 
        that all methods return consistent results.
        
        Returns:
            JSON string with:
            - Performance comparison metrics for all three methods
            - Detection results from each method
            - Consistency analysis across methods
            - Recommendations for optimal usage
        """
        try:
            import time
            
            result = {
                'comparison_timestamp': time.time(),
                'methods_compared': ['ultra_fast_optimized', 'fast_netstat', 'standard_psutil'],
                'performance_metrics': {},
                'consistency_analysis': {},
                'recommendations': []
            }
            
            # Test ultra-fast method
            start_time = time.time()
            try:
                ultra_fast_result = detect_powerbi_desktop_instances_ultra_fast()
                ultra_fast_time = (time.time() - start_time) * 1000
                
                result['performance_metrics']['ultra_fast_method'] = {
                    'detection_time_ms': round(ultra_fast_time, 2),
                    'success': ultra_fast_result.get('success', False),
                    'instances_found': len(ultra_fast_result.get('powerbi_desktop_instances', [])),
                    'as_instances_found': len(ultra_fast_result.get('analysis_services_instances', []))
                }
                
            except Exception as e:
                result['performance_metrics']['ultra_fast_method'] = {
                    'error': str(e),
                    'success': False
                }
            
            # Test fast method
            start_time = time.time()
            try:
                fast_result = detect_powerbi_desktop_instances_fast()
                fast_time = (time.time() - start_time) * 1000
                
                result['performance_metrics']['fast_method'] = {
                    'detection_time_ms': round(fast_time, 2),
                    'success': fast_result.get('success', False),
                    'instances_found': len(fast_result.get('powerbi_desktop_instances', [])),
                    'as_instances_found': len(fast_result.get('analysis_services_instances', []))
                }
                
            except Exception as e:
                result['performance_metrics']['fast_method'] = {
                    'error': str(e),
                    'success': False
                }
            
            # Test standard method
            start_time = time.time()
            try:
                standard_result = detect_powerbi_desktop_instances()
                standard_time = (time.time() - start_time) * 1000
                
                result['performance_metrics']['standard_method'] = {
                    'detection_time_ms': round(standard_time, 2),
                    'success': standard_result.get('success', False),
                    'instances_found': len(standard_result.get('powerbi_desktop_instances', [])),
                    'as_instances_found': len(standard_result.get('analysis_services_instances', []))
                }
                
            except Exception as e:
                result['performance_metrics']['standard_method'] = {
                    'error': str(e),
                    'success': False
                }
            
            # Performance comparison analysis
            ultra_fast_metrics = result['performance_metrics'].get('ultra_fast_method', {})
            fast_metrics = result['performance_metrics'].get('fast_method', {})
            standard_metrics = result['performance_metrics'].get('standard_method', {})
            
            if ultra_fast_metrics.get('success') and standard_metrics.get('success'):
                ultra_fast_time = ultra_fast_metrics.get('detection_time_ms', 0)
                standard_time = standard_metrics.get('detection_time_ms', 0)
                
                if standard_time > 0 and ultra_fast_time > 0:
                    speedup = round(standard_time / ultra_fast_time, 1)
                    time_saved = round(standard_time - ultra_fast_time, 1)
                    
                    result['performance_comparison'] = {
                        'ultra_fast_detection_time_ms': ultra_fast_time,
                        'standard_detection_time_ms': standard_time,
                        'speedup_factor': f"{speedup}x faster",
                        'time_saved_ms': time_saved,
                        'performance_improvement': f"{round((time_saved / standard_time) * 100, 1)}% faster"
                    }
                    
                    # Add fast method comparison if available
                    if fast_metrics.get('success'):
                        fast_time = fast_metrics.get('detection_time_ms', 0)
                        result['performance_comparison']['fast_detection_time_ms'] = fast_time
                
                # Consistency check across all successful methods
                methods_data = []
                for method_name, metrics in result['performance_metrics'].items():
                    if metrics.get('success'):
                        methods_data.append({
                            'name': method_name,
                            'instances': metrics.get('instances_found', 0),
                            'as_instances': metrics.get('as_instances_found', 0)
                        })
                
                if len(methods_data) > 1:
                    first_method = methods_data[0]
                    consistent = all(
                        m['instances'] == first_method['instances'] and 
                        m['as_instances'] == first_method['as_instances']
                        for m in methods_data
                    )
                    
                    result['consistency_analysis'] = {
                        'all_methods_consistent': consistent,
                        'methods_tested': [m['name'] for m in methods_data],
                        'instances_found_per_method': {m['name']: m['instances'] for m in methods_data},
                        'as_instances_found_per_method': {m['name']: m['as_instances'] for m in methods_data}
                    }
                
                # Recommendations
                if ultra_fast_time < standard_time * 0.1:  # 10x faster
                    result['recommendations'].append("Ultra-fast method is dramatically faster - strongly recommended")
                elif ultra_fast_time < standard_time * 0.5:  # 2x faster
                    result['recommendations'].append("Ultra-fast method provides significant performance improvement")
                
                if result['consistency_analysis'].get('all_methods_consistent', False):
                    result['recommendations'].append("All methods return consistent results - ultra-fast method is safe to use")
                else:
                    result['recommendations'].append("Results differ between methods - investigate detection logic")
            
            result['summary'] = {
                'recommended_method': 'ultra_fast_optimized' if ultra_fast_metrics.get('success') else 'fast_netstat',
                'performance_tested': True,
                'consistency_verified': result.get('consistency_analysis', {}).get('all_methods_consistent', False),
                'best_time_ms': min([
                    m.get('detection_time_ms', float('inf')) 
                    for m in result['performance_metrics'].values() 
                    if m.get('success')
                ], default=0)
            }
            
            return json.dumps(result, indent=2)
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error comparing detection methods: {str(e)}',
                'error_type': 'detection_comparison_error'
            })
