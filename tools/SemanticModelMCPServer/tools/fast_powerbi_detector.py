"""
Fast Power BI Desktop Detection Utility

This module provides optimized functionality to quickly detect running Power BI Desktop instances
and their Analysis Services port numbers using efficient system commands.
"""

import json
import subprocess
import re
import logging
import psutil
from typing import List, Dict, Optional, Tuple
import os
import sys

logger = logging.getLogger(__name__)

class FastPowerBIDesktopDetector:
    """
    Optimized utility class for quickly detecting running Power BI Desktop instances
    and their Analysis Services connection information.
    """
    
    def __init__(self):
        self.cache_timeout = 5  # Cache results for 5 seconds
        self._cached_result = None
        self._cache_time = 0
    
    def detect_fast(self) -> Dict[str, any]:
        """
        Fast detection of Power BI Desktop instances using optimized methods.
        
        Returns:
            Dictionary containing detected instances and connection details
        """
        import time
        current_time = time.time()
        
        # Return cached result if still fresh
        if (self._cached_result and 
            current_time - self._cache_time < self.cache_timeout):
            return self._cached_result
        
        try:
            result = {
                'success': True,
                'powerbi_desktop_instances': [],
                'analysis_services_instances': [],
                'detection_method': 'fast_optimized',
                'performance_info': {
                    'detection_time_ms': 0,
                    'method_used': 'netstat + process_filter'
                }
            }
            
            start_time = time.time()
            
            # Method 1: Fast netstat scan for listening ports
            as_ports = self._get_listening_ports_fast()
            
            # Method 2: Quick scan for msmdsrv.exe processes only
            as_processes = self._get_msmdsrv_processes_fast()
            
            # Method 3: Quick scan for PBIDesktop.exe processes
            pbi_processes = self._get_pbidesktop_processes_fast()
            
            # Combine the information efficiently
            combined_instances = self._combine_instances_fast(pbi_processes, as_processes, as_ports)
            
            detection_time = (time.time() - start_time) * 1000
            
            result.update({
                'powerbi_desktop_instances': combined_instances,
                'analysis_services_instances': as_processes,
                'total_instances': len(combined_instances),
                'total_as_instances': len(as_processes),
                'performance_info': {
                    'detection_time_ms': round(detection_time, 2),
                    'method_used': 'netstat + process_filter',
                    'ports_found': len(as_ports),
                    'as_processes_found': len(as_processes),
                    'pbi_processes_found': len(pbi_processes)
                },
                'instructions': {
                    'connection_usage': 'Use the connection_string to connect to local Power BI Desktop models',
                    'port_info': 'Power BI Desktop typically uses dynamic ports above 50000',
                    'performance': f'Fast detection completed in {detection_time:.1f}ms',
                    'testing': 'Use test_powerbi_desktop_connection(port) to verify connectivity'
                }
            })
            
            # Cache the result
            self._cached_result = result
            self._cache_time = current_time
            
            return result
            
        except Exception as e:
            logger.error(f"Fast detection failed: {str(e)}")
            return {
                'success': False,
                'error': f'Fast detection failed: {str(e)}',
                'powerbi_desktop_instances': [],
                'analysis_services_instances': [],
                'detection_method': 'fast_optimized_failed'
            }
    
    def _get_listening_ports_fast(self) -> Dict[int, Dict]:
        """
        Use netstat command to quickly get all listening ports.
        This is much faster than psutil.net_connections().
        """
        ports = {}
        
        try:
            # Use netstat for fastest port detection
            if os.name == 'nt':  # Windows
                cmd = ['netstat', '-ano', '-p', 'TCP']
            else:  # Linux/Mac
                cmd = ['netstat', '-tlnp']
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    # Parse netstat output for listening connections
                    if 'LISTENING' in line or 'LISTEN' in line:
                        parts = line.split()
                        if len(parts) >= 4:
                            try:
                                # Extract local address and port
                                local_addr = parts[1] if os.name == 'nt' else parts[3]
                                if ':' in local_addr:
                                    port_str = local_addr.split(':')[-1]
                                    port = int(port_str)
                                    
                                    # Only interested in ports > 1024 (non-system)
                                    if port > 1024:
                                        pid = None
                                        if os.name == 'nt' and len(parts) >= 5:
                                            try:
                                                pid = int(parts[-1])
                                            except ValueError:
                                                pass
                                        
                                        ports[port] = {
                                            'port': port,
                                            'pid': pid,
                                            'local_addr': local_addr
                                        }
                            except (ValueError, IndexError):
                                continue
                                
        except (subprocess.TimeoutExpired, subprocess.SubprocessError, OSError) as e:
            logger.warning(f"Netstat command failed, falling back to psutil: {e}")
            # Fallback to psutil if netstat fails
            try:
                for conn in psutil.net_connections(kind='tcp'):
                    if (conn.status == psutil.CONN_LISTEN and 
                        conn.laddr and conn.laddr.port > 1024):
                        ports[conn.laddr.port] = {
                            'port': conn.laddr.port,
                            'pid': conn.pid,
                            'local_addr': f"{conn.laddr.ip}:{conn.laddr.port}"
                        }
            except Exception:
                pass
        
        return ports
    
    def _get_msmdsrv_processes_fast(self) -> List[Dict]:
        """
        Quickly find only msmdsrv.exe processes using filtered psutil scan.
        """
        processes = []
        
        try:
            # Use process_iter with specific filter for efficiency
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    if proc.info['name'] == 'msmdsrv.exe':
                        cmdline = proc.info.get('cmdline', [])
                        cmdline_str = ' '.join(cmdline) if cmdline else ''
                        
                        # Quick check if this is Power BI Desktop related
                        is_pbi = any(indicator in cmdline_str.lower() for indicator in [
                            'power bi desktop', 'pbidesktop', 'analysisservicesworkspace'
                        ])
                        
                        if is_pbi:
                            # Don't extract port from command line - use PID to find port from netstat
                            # This will be resolved later when we combine with netstat data
                            
                            process_info = {
                                'process_name': 'msmdsrv.exe',
                                'pid': proc.info['pid'],
                                'port': None,  # Will be resolved from netstat data
                                'cmdline': cmdline_str,
                                'is_powerbi_desktop': True,
                                'connection_string': None  # Will be set after port resolution
                            }
                            
                            processes.append(process_info)
                            
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
        except Exception as e:
            logger.error(f"Error scanning msmdsrv processes: {e}")
            
        return processes
    
    def _get_pbidesktop_processes_fast(self) -> List[Dict]:
        """
        Quickly find PBIDesktop.exe processes.
        """
        processes = []
        
        try:
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'create_time']):
                try:
                    if proc.info['name'] == 'PBIDesktop.exe':
                        cmdline = proc.info.get('cmdline', [])
                        cmdline_str = ' '.join(cmdline) if cmdline else ''
                        
                        # Extract file path if present
                        file_path = None
                        if cmdline:
                            for arg in cmdline:
                                if arg.endswith('.pbix'):
                                    file_path = arg
                                    break
                        
                        process_info = {
                            'process_name': 'PBIDesktop.exe',
                            'pid': proc.info['pid'],
                            'cmdline': cmdline_str,
                            'create_time': proc.info.get('create_time'),
                            'file_path': file_path,
                            'analysis_services_port': None,
                            'connection_string': None
                        }
                        
                        processes.append(process_info)
                        
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
        except Exception as e:
            logger.error(f"Error scanning PBIDesktop processes: {e}")
            
        return processes
    
    def _extract_port_from_cmdline_fast(self, cmdline_str: str) -> Optional[int]:
        """
        Fast port extraction using optimized regex patterns.
        """
        if not cmdline_str:
            return None
        
        # Optimized regex patterns for common Power BI Desktop patterns
        patterns = [
            r':\\AnalysisServicesWorkspace_[^\\]+\\Data.*?(\d{5,6})',  # Workspace path with port
            r'-n\s+AnalysisServicesWorkspace_[^\\]+.*?(\d{5,6})',     # Workspace name with port
            r'localhost[:\s]+(\d{5,6})',                              # Direct localhost:port
            r'Port[=\s]+(\d{5,6})',                                   # Port parameter
        ]
        
        for pattern in patterns:
            match = re.search(pattern, cmdline_str, re.IGNORECASE)
            if match:
                try:
                    port = int(match.group(1))
                    # Power BI Desktop typically uses ports > 50000
                    if 50000 <= port <= 65535:
                        return port
                except (ValueError, IndexError):
                    continue
        
        return None
    
    def _combine_instances_fast(self, pbi_processes: List[Dict], 
                               as_processes: List[Dict], 
                               listening_ports: Dict[int, Dict]) -> List[Dict]:
        """
        Efficiently combine PBI Desktop and Analysis Services information.
        """
        combined = []
        
        # First, resolve ports for AS processes using netstat data
        for as_proc in as_processes:
            # Find port by matching PID with netstat data
            matching_port = None
            for port, port_info in listening_ports.items():
                if port_info.get('pid') == as_proc['pid']:
                    # Found the port for this process
                    matching_port = port
                    as_proc['port'] = port
                    as_proc['connection_string'] = f"Data Source=localhost:{port}"
                    as_proc.update({
                        'verified_listening': True,
                        'netstat_info': port_info
                    })
                    break
                    
            if matching_port is None:
                # Fallback: try to find any port > 50000 (typical for Power BI Desktop)
                # This is a heuristic when PID matching fails
                potential_ports = [p for p in listening_ports.keys() if p > 50000]
                if potential_ports:
                    fallback_port = potential_ports[0]  # Take the first available
                    as_proc['port'] = fallback_port
                    as_proc['connection_string'] = f"Data Source=localhost:{fallback_port}"
                    as_proc['fallback_port'] = True
        
        # Combine PBI Desktop processes with their AS instances
        for pbi_proc in pbi_processes:
            # Find matching AS process by PID proximity or other heuristics
            matching_as = None
            
            # Simple heuristic: match with any available AS process
            # In a more sophisticated version, we could match by workspace name, timing, etc.
            for as_proc in as_processes:
                if as_proc.get('port'):  # Only consider AS processes with resolved ports
                    matching_as = as_proc
                    break
            
            if matching_as:
                pbi_proc.update({
                    'analysis_services_port': matching_as['port'],
                    'connection_string': matching_as['connection_string'],
                    'analysis_services_info': matching_as
                })
            
            combined.append(pbi_proc)
        
        # Add standalone AS instances (not associated with PBI Desktop)
        for as_proc in as_processes:
            already_associated = any(
                inst.get('analysis_services_info', {}).get('pid') == as_proc['pid']
                for inst in combined
            )
            
            if not already_associated:
                combined.append({
                    'process_name': 'Analysis Services (Power BI Desktop)',
                    'pid': as_proc['pid'],
                    'cmdline': as_proc['cmdline'],
                    'create_time': None,
                    'analysis_services_port': as_proc.get('port'),
                    'connection_string': as_proc.get('connection_string'),
                    'file_path': None,
                    'analysis_services_info': as_proc
                })
        
        return combined
    
    def clear_cache(self):
        """Clear the detection cache to force fresh detection."""
        self._cached_result = None
        self._cache_time = 0


# Fast detection function for MCP tools
def detect_powerbi_desktop_instances_fast() -> Dict:
    """
    Fast detection of Power BI Desktop instances using optimized methods.
    
    Returns:
        Dictionary with detected instances and performance metrics
    """
    detector = FastPowerBIDesktopDetector()
    result = detector.detect_fast()
    return result
