"""
Power BI Desktop Detection Utility

This module provides functionality to detect running Power BI Desktop instances
and their Analysis Services port numbers for local development and testing.
"""

import json
import subprocess
import re
import logging
import psutil
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

class PowerBIDesktopDetector:
    """
    Utility class for detecting running Power BI Desktop instances
    and their Analysis Services connection information.
    """
    
    def __init__(self):
        self.pbi_process_names = [
            "PBIDesktop.exe",
            "msmdsrv.exe",  # Analysis Services process
            "Microsoft.Mashup.Container.exe"  # Power Query process
        ]
    
    def find_powerbi_desktop_instances(self) -> List[Dict[str, any]]:
        """
        Find all running Power BI Desktop instances with their process information.
        
        Returns:
            List of dictionaries containing Power BI Desktop instance information
        """
        instances = []
        
        try:
            for process in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time']):
                try:
                    process_info = process.info
                    process_name = process_info['name']
                    
                    if process_name in ['PBIDesktop.exe']:
                        # Found Power BI Desktop process
                        cmdline = process_info.get('cmdline', [])
                        
                        instance = {
                            'process_name': process_name,
                            'pid': process_info['pid'],
                            'cmdline': ' '.join(cmdline) if cmdline else '',
                            'create_time': process_info['create_time'],
                            'analysis_services_port': None,
                            'workspace_id': None,
                            'file_path': None
                        }
                        
                        # Try to extract file path from command line
                        if cmdline:
                            for arg in cmdline:
                                if arg.endswith('.pbix'):
                                    instance['file_path'] = arg
                                    break
                        
                        instances.append(instance)
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    continue
                    
        except Exception as e:
            logger.error(f"Error finding Power BI Desktop instances: {str(e)}")
            
        return instances
    
    def find_analysis_services_ports(self) -> List[Dict[str, any]]:
        """
        Find Analysis Services (msmdsrv.exe) processes and their port numbers.
        
        Returns:
            List of dictionaries containing Analysis Services instance information
        """
        as_instances = []
        
        try:
            for process in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    process_info = process.info
                    
                    if process_info['name'] == 'msmdsrv.exe':
                        # Found Analysis Services process
                        pid = process_info['pid']
                        cmdline = process_info.get('cmdline', [])
                        
                        # Try to get port from command line arguments
                        port = self._extract_port_from_cmdline(cmdline)
                        
                        # If not found in cmdline, check network connections
                        if not port:
                            port = self._extract_port_from_connections(process)
                        
                        # Try to determine if this is a Power BI Desktop instance
                        is_pbi_desktop = self._is_powerbi_desktop_as_instance(cmdline)
                        
                        instance = {
                            'process_name': 'msmdsrv.exe',
                            'pid': pid,
                            'port': port,
                            'cmdline': ' '.join(cmdline) if cmdline else '',
                            'is_powerbi_desktop': is_pbi_desktop,
                            'connection_string': f"Data Source=localhost:{port}" if port else None
                        }
                        
                        as_instances.append(instance)
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess, AttributeError):
                    continue
                    
        except Exception as e:
            logger.error(f"Error finding Analysis Services instances: {str(e)}")
            
        return as_instances
    
    def get_powerbi_desktop_connections(self) -> List[Dict[str, any]]:
        """
        Get complete connection information for Power BI Desktop instances.
        
        Returns:
            List of dictionaries with combined Power BI Desktop and Analysis Services info
        """
        pbi_instances = self.find_powerbi_desktop_instances()
        as_instances = self.find_analysis_services_ports()
        
        # Filter to only Power BI Desktop related Analysis Services instances
        pbi_as_instances = [as_inst for as_inst in as_instances if as_inst['is_powerbi_desktop']]
        
        # Combine the information
        combined_instances = []
        
        for pbi_instance in pbi_instances:
            # Try to find corresponding Analysis Services instance
            # This is heuristic - we look for AS instances created around the same time
            corresponding_as = None
            
            for as_instance in pbi_as_instances:
                # Simple heuristic: assume they're related if AS was started recently
                # In practice, you might need more sophisticated matching
                corresponding_as = as_instance
                break  # Take the first one for now
            
            combined_instance = {
                **pbi_instance,
                'analysis_services_info': corresponding_as
            }
            
            if corresponding_as:
                combined_instance['analysis_services_port'] = corresponding_as['port']
                combined_instance['connection_string'] = corresponding_as['connection_string']
            
            combined_instances.append(combined_instance)
        
        # Add any standalone Analysis Services instances that might be Power BI Desktop
        for as_instance in pbi_as_instances:
            # Check if this AS instance is already associated with a PBI instance
            already_associated = any(
                inst['analysis_services_info'] and 
                inst['analysis_services_info']['pid'] == as_instance['pid'] 
                for inst in combined_instances
            )
            
            if not already_associated:
                # Add as standalone instance
                combined_instances.append({
                    'process_name': 'Analysis Services (Power BI Desktop)',
                    'pid': as_instance['pid'],
                    'cmdline': as_instance['cmdline'],
                    'create_time': None,
                    'analysis_services_port': as_instance['port'],
                    'connection_string': as_instance['connection_string'],
                    'file_path': None,
                    'analysis_services_info': as_instance
                })
        
        return combined_instances
    
    def _extract_port_from_cmdline(self, cmdline: List[str]) -> Optional[int]:
        """Extract port number from command line arguments."""
        if not cmdline:
            return None
            
        cmdline_str = ' '.join(cmdline)
        
        # Look for port patterns in command line
        port_patterns = [
            r'-s\s+localhost:(\d+)',  # -s localhost:port
            r'--port[=\s](\d+)',      # --port=port or --port port
            r'Port=(\d+)',            # Port=port
            r':(\d+)',                # :port
        ]
        
        for pattern in port_patterns:
            match = re.search(pattern, cmdline_str, re.IGNORECASE)
            if match:
                try:
                    return int(match.group(1))
                except (ValueError, IndexError):
                    continue
        
        return None
    
    def _extract_port_from_connections(self, process) -> Optional[int]:
        """Extract port number from process network connections."""
        try:
            # Check if the process has the connections method
            if not hasattr(process, 'connections'):
                return None
                
            connections = process.connections()
            
            for conn in connections:
                if (conn.status == psutil.CONN_LISTEN and 
                    conn.laddr.ip in ['127.0.0.1', '0.0.0.0', '::']):
                    # Found a listening connection on localhost
                    port = conn.laddr.port
                    
                    # Analysis Services typically uses ports in certain ranges
                    # Power BI Desktop usually uses dynamic ports > 50000
                    if port > 1024:  # Skip system ports
                        return port
                        
        except (psutil.AccessDenied, psutil.NoSuchProcess, AttributeError):
            pass
            
        return None
    
    def _is_powerbi_desktop_as_instance(self, cmdline: List[str]) -> bool:
        """Determine if this Analysis Services instance belongs to Power BI Desktop."""
        if not cmdline:
            return False
            
        cmdline_str = ' '.join(cmdline).lower()
        
        # Look for indicators that this is Power BI Desktop's Analysis Services
        pbi_indicators = [
            'pbidesktop',
            'powerbi',
            'power bi',
            'microsoft\\power bi desktop',
            'localserver\\pbirs',
        ]
        
        return any(indicator in cmdline_str for indicator in pbi_indicators)
    
    def get_connection_string(self, port: int) -> str:
        """
        Generate connection string for given port.
        
        Power BI Desktop connections are simpler than Power BI Service connections:
        - Power BI Desktop: "Data Source=localhost:{port}" (no authentication required)
        - Power BI Service: "Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace};Initial Catalog={dataset};User ID=app:{appId}@{tenantId};Password={accessToken}"
        
        Local Power BI Desktop instances run Analysis Services without authentication,
        making them ideal for development and testing scenarios.
        """
        return f"Data Source=localhost:{port}"
    
    def get_powerbi_service_connection_example(self, workspace: str, dataset: str) -> str:
        """
        Generate example Power BI Service connection string for comparison.
        
        This shows the difference between local and service connections.
        Note: This is just an example - actual service connections require proper authentication.
        """
        return f"Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace};Initial Catalog={dataset}"
    
    def compare_connection_types(self) -> Dict[str, str]:
        """
        Compare different Analysis Services connection types.
        
        Returns:
            Dictionary with connection type comparisons and explanations
        """
        return {
            'power_bi_desktop': {
                'connection_string': 'Data Source=localhost:{port}',
                'authentication': 'None required (local process)',
                'use_case': 'Development, testing, debugging',
                'advantages': ['No authentication needed', 'Direct model access', 'Fast connection', 'Local data'],
                'requirements': ['Power BI Desktop running', 'Model file open']
            },
            'power_bi_service': {
                'connection_string': 'Data Source=powerbi://api.powerbi.com/v1.0/myorg/{workspace};Initial Catalog={dataset}',
                'authentication': 'Access token or user credentials required',
                'use_case': 'Production, published models, collaboration',
                'advantages': ['Shared access', 'Premium features', 'Scheduled refresh', 'Cloud scalability'],
                'requirements': ['Published model', 'Valid authentication', 'Network access']
            },
            'analysis_services': {
                'connection_string': 'Data Source={server};Initial Catalog={database}',
                'authentication': 'Windows authentication or username/password',
                'use_case': 'Enterprise tabular models, on-premises',
                'advantages': ['Full control', 'Custom configuration', 'Enterprise security'],
                'requirements': ['Analysis Services server', 'Network access', 'Proper permissions']
            }
        }
    
    def test_connection(self, port: int) -> Dict[str, any]:
        """
        Test connection to Analysis Services instance on given port.
        
        Args:
            port: Port number to test
            
        Returns:
            Dictionary with connection test results
        """
        connection_string = self.get_connection_string(port)
        
        try:
            # Try to import Analysis Services libraries
            import clr
            import os
            
            # Add references to Analysis Services libraries
            current_dir = os.path.dirname(os.path.abspath(__file__))
            dotnet_dir = os.path.join(os.path.dirname(current_dir), "dotnet")
            
            clr.AddReference(os.path.join(dotnet_dir, "Microsoft.AnalysisServices.AdomdClient.dll"))
            from Microsoft.AnalysisServices.AdomdClient import AdomdConnection
            
            # Test connection - Power BI Desktop doesn't require authentication
            # Simple connection string: "Data Source=localhost:port"
            conn = AdomdConnection(connection_string)
            conn.Open()
            
            try:
                # Try to get server properties to verify connection
                cmd = conn.CreateCommand()
                cmd.CommandText = "SELECT * FROM $SYSTEM.DISCOVER_PROPERTIES WHERE PropertyName IN ('ServerName', 'ProductName', 'ProductVersion')"
                
                reader = cmd.ExecuteReader()
                properties = []
                
                while reader.Read():
                    properties.append({
                        'PropertyName': str(reader['PropertyName']),
                        'PropertyValue': str(reader['PropertyValue'])
                    })
                
                reader.Close()
                
                # Also try to get database information
                cmd.CommandText = "SELECT * FROM $SYSTEM.DBSCHEMA_CATALOGS"
                reader = cmd.ExecuteReader()
                
                databases = []
                while reader.Read():
                    databases.append({
                        'CatalogName': str(reader['CATALOG_NAME']),
                        'Description': str(reader.get('DESCRIPTION', ''))
                    })
                
                reader.Close()
                conn.Close()
                
                return {
                    'success': True,
                    'port': port,
                    'connection_string': connection_string,
                    'server_properties': properties,
                    'databases': databases,
                    'message': 'Connection successful - Power BI Desktop Analysis Services',
                    'connection_type': 'Power BI Desktop (Local)'
                }
                
            except Exception as query_error:
                # Connection worked but query failed
                conn.Close()
                return {
                    'success': True,
                    'port': port,
                    'connection_string': connection_string,
                    'server_properties': [],
                    'message': f'Connection successful but query failed: {str(query_error)}',
                    'connection_type': 'Power BI Desktop (Local)',
                    'query_error': str(query_error)
                }
                
        except ImportError as e:
            return {
                'success': False,
                'port': port,
                'connection_string': connection_string,
                'error': f'Analysis Services libraries not available: {str(e)}',
                'message': 'Cannot test connection - missing dependencies'
            }
        except Exception as e:
            return {
                'success': False,
                'port': port,
                'connection_string': connection_string,
                'error': str(e),
                'message': 'Connection failed'
            }

def detect_powerbi_desktop_instances() -> str:
    """
    Detect running Power BI Desktop instances and return connection information.
    
    Returns:
        JSON string with detected instances and connection details
    """
    detector = PowerBIDesktopDetector()
    
    try:
        # Get all Power BI Desktop related instances
        instances = detector.get_powerbi_desktop_connections()
        
        # Get Analysis Services specific information
        as_instances = detector.find_analysis_services_ports()
        
        result = {
            'success': True,
            'powerbi_desktop_instances': instances,
            'analysis_services_instances': as_instances,
            'total_instances': len(instances),
            'total_as_instances': len(as_instances),
            'instructions': {
                'connection_usage': 'Use the connection_string to connect to local Power BI Desktop models',
                'port_info': 'Power BI Desktop typically uses dynamic ports above 50000',
                'testing': 'Use test_powerbi_desktop_connection(port) to verify connectivity'
            }
        }
        
        return json.dumps(result, indent=2, default=str)
        
    except Exception as e:
        logger.error(f"Error detecting Power BI Desktop instances: {str(e)}")
        return json.dumps({
            'success': False,
            'error': str(e),
            'powerbi_desktop_instances': [],
            'analysis_services_instances': [],
            'total_instances': 0
        }, indent=2)

def test_powerbi_desktop_connection(port: int) -> str:
    """
    Test connection to a Power BI Desktop Analysis Services instance.
    
    Args:
        port: Port number to test
        
    Returns:
        JSON string with connection test results
    """
    detector = PowerBIDesktopDetector()
    result = detector.test_connection(port)
    return json.dumps(result, indent=2, default=str)
