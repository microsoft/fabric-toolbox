"""
BPA (Best Practice Analyzer) Tools for Semantic Model MCP Server

This module contains all BPA-related MCP tools for analyzing semantic models
and TMSL definitions against best practice rules.
"""

import os
from fastmcp import FastMCP
import json
from core.bpa_service import BPAService

def register_bpa_tools(mcp: FastMCP):
    """Register all BPA-related MCP tools"""

    @mcp.tool
    def analyze_model_bpa(workspace_name: str, dataset_name: str) -> str:
        """Analyze a semantic model against Best Practice Analyzer (BPA) rules.

        This tool retrieves the TMSL definition of a model and runs it through
        a comprehensive set of best practice rules to identify potential issues.

        Args:
            workspace_name: The Power BI workspace name
            dataset_name: The dataset/model name to analyze

        Returns:
            JSON string with BPA analysis results including violations and summary
        """
        try:
            # For now, use analyze_tmsl_bpa as a workaround
            # This is a workaround - use the existing tool pipeline
            # Get TMSL first, then analyze it
            return json.dumps({
                'success': False,
                'error': 'analyze_model_bpa is temporarily unavailable. Please use get_model_definition followed by analyze_tmsl_bpa as a workaround.',
                'error_type': 'function_unavailable',
                'workaround': {
                    'step1': f'tmsl = get_model_definition("{workspace_name}", "{dataset_name}")',
                    'step2': 'result = analyze_tmsl_bpa(tmsl["result"])'
                }
            })
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'BPA analysis failed: {str(e)}',
                'error_type': 'bpa_analysis_error'
            })

    @mcp.tool  
    def analyze_tmsl_bpa(tmsl_definition: str) -> str:
        """Analyze a TMSL definition directly against Best Practice Analyzer (BPA) rules.

        This tool takes a TMSL JSON string and analyzes it against a comprehensive
        set of best practice rules to identify potential issues.
        
        The tool automatically handles JSON formatting issues including:
        - Carriage returns and line ending normalization
        - Escaped quotes and backslashes
        - Nested JSON string decoding

        Args:
            tmsl_definition: TMSL JSON string (raw or escaped format)

        Returns:
            JSON string with BPA analysis results including violations and summary
        """
        try:
            # Get the server directory (parent of tools directory)
            server_directory = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            bpa_service = BPAService(server_directory)
            result = bpa_service.analyze_model_from_tmsl(tmsl_definition)
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'TMSL BPA analysis failed: {str(e)}',
                'error_type': 'tmsl_bpa_analysis_error'
            })

    @mcp.tool
    def get_bpa_violations_by_severity(severity: str) -> str:
        """Get BPA violations filtered by severity level.

        Note: You must run analyze_model_bpa or analyze_tmsl_bpa first to generate violations.

        Args:
            severity: Severity level to filter by (INFO, WARNING, ERROR)

        Returns:
            JSON string with filtered violations
        """
        try:
            # Get the server directory (parent of tools directory)
            server_directory = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            bpa_service = BPAService(server_directory)
            violations = bpa_service.get_violations_by_severity(severity)
            
            return json.dumps({
                'success': True,
                'severity_filter': severity,
                'violation_count': len(violations),
                'violations': violations
            }, indent=2)
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error filtering BPA violations by severity: {str(e)}',
                'error_type': 'bpa_filter_error'
            })

    @mcp.tool
    def get_bpa_violations_by_category(category: str) -> str:
        """Get BPA violations filtered by category.

        Note: You must run analyze_model_bpa or analyze_tmsl_bpa first to generate violations.

        Args:
            category: Category to filter by (Performance, DAX Expressions, Maintenance, Naming Conventions, Formatting)

        Returns:
            JSON string with filtered violations
        """
        try:
            # Get the server directory (parent of tools directory)
            server_directory = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            bpa_service = BPAService(server_directory)
            violations = bpa_service.get_violations_by_category(category)
            
            return json.dumps({
                'success': True,
                'category_filter': category,
                'violation_count': len(violations),
                'violations': violations
            }, indent=2)
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error filtering BPA violations by category: {str(e)}',
                'error_type': 'bpa_filter_error'
            })

    @mcp.tool
    def get_bpa_rules_summary() -> str:
        """Get summary information about loaded BPA rules.

        Returns:
            JSON string with rules summary including counts by category and severity
        """
        try:
            # Get the server directory (parent of tools directory)
            server_directory = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            bpa_service = BPAService(server_directory)
            summary = bpa_service.get_rules_summary()
            
            return json.dumps({
                'success': True,
                'rules_summary': summary
            }, indent=2)
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error getting BPA rules summary: {str(e)}',
                'error_type': 'bpa_rules_error'
            })

    @mcp.tool
    def get_bpa_categories() -> str:
        """Get list of available BPA rule categories.

        Returns:
            JSON string with list of available categories
        """
        try:
            # Get the server directory (parent of tools directory)
            server_directory = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            bpa_service = BPAService(server_directory)
            categories = bpa_service.get_available_categories()
            
            return json.dumps({
                'success': True,
                'available_categories': categories
            }, indent=2)
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error getting BPA categories: {str(e)}',
                'error_type': 'bpa_categories_error'
            })

    @mcp.tool
    def generate_bpa_report(workspace_name: str, dataset_name: str, format_type: str = 'summary') -> str:
        """Generate a comprehensive Best Practice Analyzer report for a semantic model.

        Args:
            workspace_name: The Power BI workspace name
            dataset_name: The dataset/model name to analyze  
            format_type: Report format ('summary', 'detailed', 'by_category')

        Returns:
            JSON string with comprehensive BPA report
        """
        try:
            # Import required modules for PowerBI connection
            import urllib.parse
            import sys
            import os
            
            # Add .NET assemblies path
            script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            dotnet_dir = os.path.join(script_dir, "dotnet")
            
            sys.path.append(script_dir)
            import clr
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.Tabular.dll"))
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.Identity.Client.dll"))
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.IdentityModel.Abstractions.dll"))
            
            from Microsoft.AnalysisServices.Tabular import Server, Database, JsonSerializer, SerializeOptions # type: ignore
            
            # Import auth function from core
            from core.auth import get_access_token
            
            # Get access token
            access_token = get_access_token()
            if not access_token:
                return json.dumps({
                    'success': False,
                    'error': "No valid access token available",
                    'error_type': 'auth_error'
                })

            # Connect to Power BI and get TMSL definition
            workspace_name_encoded = urllib.parse.quote(workspace_name)
            connection_string = f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace_name_encoded};Password={access_token}"

            server = Server()
            server.Connect(connection_string)
            
            # Find the database/dataset
            database = None
            for db in server.Databases:
                if db.Name == dataset_name:
                    database = db
                    break
            
            if not database:
                server.Disconnect()
                return json.dumps({
                    'success': False,
                    'error': f"Dataset '{dataset_name}' not found in workspace '{workspace_name}'",
                    'error_type': 'dataset_not_found'
                })
            
            # Get TMSL definition
            options = SerializeOptions()
            options.IgnoreInferredObjects = True
            options.IgnoreInferredProperties = True
            options.IgnoreTimestamps = True
            options.SplitMultilineStrings = True
            
            tmsl_definition = JsonSerializer.SerializeDatabase(database, options)
            server.Disconnect()
            
            # Generate BPA report
            server_directory = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            bpa_service = BPAService(server_directory)
            report = bpa_service.generate_bpa_report(tmsl_definition, format_type)
            
            return json.dumps({
                'success': True,
                'workspace_name': workspace_name,
                'dataset_name': dataset_name,
                'format_type': format_type,
                'report': report
            }, indent=2)
            
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error generating BPA report: {str(e)}',
                'error_type': 'bpa_report_error'
            })
