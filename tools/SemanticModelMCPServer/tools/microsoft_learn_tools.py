"""
Microsoft Learn Tools for Semantic Model MCP Server

This module contains all Microsoft Learn related MCP tools for searching
and retrieving educational content.
"""

from fastmcp import FastMCP
import json
from tools.microsoft_learn import search_microsoft_learn, get_microsoft_learn_paths, get_microsoft_learn_modules, get_microsoft_learn_content

def register_microsoft_learn_tools(mcp: FastMCP):
    """Register all Microsoft Learn related MCP tools"""

    @mcp.tool
    def search_learn_microsoft_content(query: str, locale: str = "en-us", top: int = 10, content_type: str = None) -> str:
        """Search Microsoft Learn documentation and content.

        Args:
            query: Search query for Microsoft Learn content
            locale: Language locale (default: en-us)
            top: Maximum number of results to return (default: 10)
            content_type: Filter by content type (e.g., 'documentation', 'learning-path', 'module')

        Returns:
            JSON string with search results from Microsoft Learn
        """
        try:
            result = search_microsoft_learn(query, locale, top, content_type)
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error searching Microsoft Learn content: {str(e)}',
                'error_type': 'microsoft_learn_search_error'
            })

    @mcp.tool
    def get_learn_microsoft_paths(locale: str = "en-us", top: int = 20) -> str:
        """Get Microsoft Learn learning paths.

        Args:
            locale: Language locale (default: en-us)
            top: Maximum number of results to return (default: 20)

        Returns:
            JSON string with learning paths from Microsoft Learn
        """
        try:
            result = get_microsoft_learn_paths(locale, top)
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error getting Microsoft Learn paths: {str(e)}',
                'error_type': 'microsoft_learn_paths_error'
            })

    @mcp.tool
    def get_learn_microsoft_modules(locale: str = "en-us", top: int = 20, learning_path_id: str = None) -> str:
        """Get Microsoft Learn modules.

        Args:
            locale: Language locale (default: en-us)
            top: Maximum number of results to return (default: 20)
            learning_path_id: Filter by specific learning path ID

        Returns:
            JSON string with modules from Microsoft Learn
        """
        try:
            result = get_microsoft_learn_modules(locale, top, learning_path_id)
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error getting Microsoft Learn modules: {str(e)}',
                'error_type': 'microsoft_learn_modules_error'
            })

    @mcp.tool
    def get_learn_microsoft_content(content_url: str, locale: str = "en-us") -> str:
        """Get specific Microsoft Learn content by URL.

        Args:
            content_url: Microsoft Learn content URL
            locale: Language locale (default: en-us)

        Returns:
            JSON string with content details from Microsoft Learn
        """
        try:
            result = get_microsoft_learn_content(content_url, locale)
            return json.dumps(result, indent=2)
        except Exception as e:
            return json.dumps({
                'success': False,
                'error': f'Error getting Microsoft Learn content: {str(e)}',
                'error_type': 'microsoft_learn_content_error'
            })
