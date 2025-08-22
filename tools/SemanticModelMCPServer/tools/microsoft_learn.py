# Microsoft Learn API integration for Semantic Model MCP Server
import json
import requests
from typing import Optional, List, Dict, Any
from urllib.parse import quote, urljoin
import logging

logger = logging.getLogger(__name__)

class MicrosoftLearnAPI:
    """Client for Microsoft Learn API integration."""
    
    BASE_URL = "https://learn.microsoft.com/api"
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Semantic-Model-MCP-Server/1.0',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        })
    
    def search_content(self, query: str, locale: str = "en-us", top: int = 10, 
                      content_type: Optional[str] = None) -> Dict[str, Any]:
        """
        Search Microsoft Learn content using the docs search endpoint.
        
        Args:
            query: Search query string
            locale: Language locale (default: en-us)
            top: Maximum number of results (default: 10)
            content_type: Filter by content type (e.g., 'documentation', 'learning-path', 'module')
        
        Returns:
            Search results from Microsoft Learn
        """
        try:
            # Use the Microsoft Docs search endpoint which is publicly available
            url = "https://docs.microsoft.com/api/search"
            
            params = {
                'search': query,
                'locale': locale,
                'facet': 'category',
                'top': top
            }
            
            if content_type:
                params['$filter'] = f"category eq '{content_type}'"
            
            response = self.session.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                # Transform the response to be more useful
                if 'results' in data:
                    return {
                        "success": True,
                        "query": query,
                        "total_results": len(data['results']),
                        "results": data['results']
                    }
                else:
                    return data
            else:
                # Fallback: Return a simulated response with guidance
                return {
                    "success": False,
                    "error": f"API returned status {response.status_code}",
                    "fallback_guidance": {
                        "message": "Microsoft Learn API may have changed. Here are manual search suggestions:",
                        "search_url": f"https://learn.microsoft.com/en-us/search/?terms={query.replace(' ', '%20')}",
                        "common_topics": [
                            "Power BI DirectLake",
                            "Microsoft Fabric",
                            "Analysis Services",
                            "DAX",
                            "TMSL"
                        ]
                    }
                }
                
        except Exception as e:
            logger.error(f"Error searching Microsoft Learn: {str(e)}")
            return {
                "success": False,
                "error": "Search failed",
                "message": str(e),
                "fallback_guidance": {
                    "message": "Try searching manually at:",
                    "search_url": f"https://learn.microsoft.com/en-us/search/?terms={query.replace(' ', '%20')}"
                }
            }
    
    def get_learning_paths(self, locale: str = "en-us", top: int = 20) -> Dict[str, Any]:
        """
        Get Microsoft Learn learning paths.
        
        Args:
            locale: Language locale (default: en-us)
            top: Maximum number of results (default: 20)
        
        Returns:
            Learning paths from Microsoft Learn
        """
        try:
            url = f"{self.BASE_URL}/learningpaths"
            
            params = {
                'locale': locale,
                '$top': top
            }
            
            response = self.session.get(url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Learning paths request failed with status {response.status_code}: {response.text}")
                return {
                    "error": f"Request failed with status {response.status_code}",
                    "message": response.text
                }
                
        except Exception as e:
            logger.error(f"Error getting learning paths: {str(e)}")
            return {
                "error": "Request failed",
                "message": str(e)
            }
    
    def get_modules(self, locale: str = "en-us", top: int = 20, 
                   learning_path_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get Microsoft Learn modules.
        
        Args:
            locale: Language locale (default: en-us)
            top: Maximum number of results (default: 20)
            learning_path_id: Filter by specific learning path ID
        
        Returns:
            Modules from Microsoft Learn
        """
        try:
            url = f"{self.BASE_URL}/modules"
            
            params = {
                'locale': locale,
                '$top': top
            }
            
            if learning_path_id:
                params['learningPathId'] = learning_path_id
            
            response = self.session.get(url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Modules request failed with status {response.status_code}: {response.text}")
                return {
                    "error": f"Request failed with status {response.status_code}",
                    "message": response.text
                }
                
        except Exception as e:
            logger.error(f"Error getting modules: {str(e)}")
            return {
                "error": "Request failed",
                "message": str(e)
            }
    
    def get_content_by_url(self, content_url: str, locale: str = "en-us") -> Dict[str, Any]:
        """
        Get specific content by URL.
        
        Args:
            content_url: The Microsoft Learn content URL
            locale: Language locale (default: en-us)
        
        Returns:
            Content details from Microsoft Learn
        """
        try:
            # Extract the path from the URL for API call
            if content_url.startswith('https://learn.microsoft.com/'):
                path = content_url.replace('https://learn.microsoft.com/', '')
            else:
                path = content_url
            
            url = f"{self.BASE_URL}/content/{quote(path)}"
            
            params = {
                'locale': locale
            }
            
            response = self.session.get(url, params=params)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"Content request failed with status {response.status_code}: {response.text}")
                return {
                    "error": f"Request failed with status {response.status_code}",
                    "message": response.text
                }
                
        except Exception as e:
            logger.error(f"Error getting content: {str(e)}")
            return {
                "error": "Request failed",
                "message": str(e)
            }

# Initialize the API client
learn_api = MicrosoftLearnAPI()

def search_microsoft_learn(query: str, locale: str = "en-us", top: int = 10, 
                          content_type: Optional[str] = None) -> str:
    """
    Search Microsoft Learn documentation and content.
    
    Args:
        query: Search query for Microsoft Learn content
        locale: Language locale (default: en-us)
        top: Maximum number of results to return (default: 10)
        content_type: Filter by content type (e.g., 'documentation', 'learning-path', 'module')
    
    Returns:
        JSON string with search results
    """
    result = learn_api.search_content(query, locale, top, content_type)
    return json.dumps(result, indent=2)

def get_microsoft_learn_paths(locale: str = "en-us", top: int = 20) -> str:
    """
    Get Microsoft Learn learning paths.
    
    Args:
        locale: Language locale (default: en-us)
        top: Maximum number of results to return (default: 20)
    
    Returns:
        JSON string with learning paths
    """
    result = learn_api.get_learning_paths(locale, top)
    return json.dumps(result, indent=2)

def get_microsoft_learn_modules(locale: str = "en-us", top: int = 20, 
                               learning_path_id: Optional[str] = None) -> str:
    """
    Get Microsoft Learn modules.
    
    Args:
        locale: Language locale (default: en-us)
        top: Maximum number of results to return (default: 20)
        learning_path_id: Filter by specific learning path ID
    
    Returns:
        JSON string with modules
    """
    result = learn_api.get_modules(locale, top, learning_path_id)
    return json.dumps(result, indent=2)

def get_microsoft_learn_content(content_url: str, locale: str = "en-us") -> str:
    """
    Get specific Microsoft Learn content by URL.
    
    Args:
        content_url: Microsoft Learn content URL
        locale: Language locale (default: en-us)
    
    Returns:
        JSON string with content details
    """
    result = learn_api.get_content_by_url(content_url, locale)
    return json.dumps(result, indent=2)
