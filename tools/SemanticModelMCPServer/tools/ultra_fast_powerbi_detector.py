"""
Ultra-Fast Power BI Desktop Detection Utility

This module provides ultra-optimized functionality to quickly detect running Power BI Desktop instances
using the most efficient system commands and minimal process scanning.
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

class UltraFastPowerBIDesktopDetector:
    """
    Ultra-optimized utility class for lightning-fast detection of running Power BI Desktop instances.
    """
    
    def __init__(self):
        self.cache_timeout = 5  # Cache results for 5 seconds
        self._cached_result = None
        self._cache_time = 0
    
    def detect_ultra_fast(self) -> Dict[str, any]:
        """
        Ultra-fast detection using the most optimized methods available.
        
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
                'detection_method': 'ultra_fast_optimized',
                'performance_info': {
                    'detection_time_ms': 0,
                    'method_used': 'single_pass_psutil + netstat'
                }
            }
            
            start_time = time.time()
            
            # Ultra-fast single-pass process detection
            pbi_processes, as_processes = self._get_processes_single_pass()
            
            # Fast netstat scan for listening ports
            listening_ports = self._get_listening_ports_ultra_fast()
            
            # Resolve ports for AS processes
            self._resolve_ports_fast(as_processes, listening_ports)
            
            # Combine instances efficiently
            combined_instances = self._combine_instances_ultra_fast(pbi_processes, as_processes)
            
            detection_time = (time.time() - start_time) * 1000
            
            result.update({
                'powerbi_desktop_instances': combined_instances,
                'analysis_services_instances': as_processes,
                'total_instances': len(combined_instances),
                'total_as_instances': len(as_processes),
                'performance_info': {
                    'detection_time_ms': round(detection_time, 2),
                    'method_used': 'single_pass_psutil + netstat',
                    'ports_found': len(listening_ports),
                    'as_processes_found': len(as_processes),
                    'pbi_processes_found': len(pbi_processes)
                },
                'instructions': {
                    'connection_usage': 'Use the connection_string to connect to local Power BI Desktop models',
                    'port_info': 'Power BI Desktop typically uses dynamic ports above 50000',
                    'performance': f'Ultra-fast detection completed in {detection_time:.1f}ms',
                    'testing': 'Use test_powerbi_desktop_connection(port) to verify connectivity'
                }
            })
            
            # Cache the result
            self._cached_result = result
            self._cache_time = current_time
            
            return result
            
        except Exception as e:
            logger.error(f"Ultra-fast detection failed: {str(e)}")
            return {
                'success': False,
                'error': f'Ultra-fast detection failed: {str(e)}',
                'powerbi_desktop_instances': [],
                'analysis_services_instances': [],
                'detection_method': 'ultra_fast_failed'
            }
    
    def _get_processes_single_pass(self) -> Tuple[List[Dict], List[Dict]]:
        """
        Single-pass process detection - get only what we need, when we need it.
        """
        pbi_processes = []
        as_processes = []
        
        try:
            # Single pass through processes - only get name and pid first
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    name = proc.info['name']
                    pid = proc.info['pid']
                    
                    if name == 'PBIDesktop.exe':
                        # For PBI Desktop, we only need basic info - get cmdline only if needed
                        try:
                            cmdline = proc.cmdline()
                            cmdline_str = ' '.join(cmdline)
                            
                            # Extract file path efficiently
                            file_path = None
                            for arg in cmdline:
                                if arg.endswith('.pbix'):
                                    file_path = arg
                                    break
                            
                            pbi_processes.append({
                                'process_name': 'PBIDesktop.exe',
                                'pid': pid,
                                'cmdline': cmdline_str,
                                'create_time': None,  # Skip expensive create_time call
                                'file_path': file_path,
                                'analysis_services_port': None,
                                'connection_string': None
                            })
                        except (psutil.AccessDenied, psutil.NoSuchProcess):
                            # If we can't get cmdline, still add basic info
                            pbi_processes.append({
                                'process_name': 'PBIDesktop.exe',
                                'pid': pid,
                                'cmdline': '',
                                'create_time': None,
                                'file_path': None,
                                'analysis_services_port': None,
                                'connection_string': None
                            })
                    
                    elif name == 'msmdsrv.exe':
                        # For AS processes, we need cmdline to check if it's Power BI Desktop
                        try:
                            cmdline = proc.cmdline()
                            cmdline_str = ' '.join(cmdline)
                            
                            # Quick check if this is Power BI Desktop related
                            if 'analysisservicesworkspace' in cmdline_str.lower():
                                as_processes.append({
                                    'process_name': 'msmdsrv.exe',
                                    'pid': pid,
                                    'port': None,  # Will be resolved later
                                    'cmdline': cmdline_str,
                                    'is_powerbi_desktop': True,
                                    'connection_string': None
                                })
                        except (psutil.AccessDenied, psutil.NoSuchProcess):
                            # Skip if we can't access
                            pass
                            
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
        except Exception as e:
            logger.error(f"Error in single-pass process scan: {e}")
            
        return pbi_processes, as_processes
    
    def _get_listening_ports_ultra_fast(self) -> Dict[int, Dict]:
        """
        Ultra-fast port detection using netstat only.
        """
        ports = {}
        
        try:
            # Use netstat for fastest port detection - Windows optimized
            cmd = ['netstat', '-ano', '-p', 'TCP']
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
            
            if result.returncode == 0:
                lines = result.stdout.split('\n')
                for line in lines:
                    if 'LISTENING' in line:
                        parts = line.split()
                        if len(parts) >= 5:
                            try:
                                local_addr = parts[1]
                                if ':' in local_addr:
                                    port = int(local_addr.split(':')[-1])
                                    pid = int(parts[4])
                                    
                                    # Only interested in ports > 50000 (Power BI Desktop range)
                                    if port > 50000:
                                        ports[port] = {
                                            'port': port,
                                            'pid': pid,
                                            'local_addr': local_addr
                                        }
                            except (ValueError, IndexError):
                                continue
                                
        except Exception as e:
            logger.warning(f"Netstat failed: {e}")
            
        return ports
    
    def _resolve_ports_fast(self, as_processes: List[Dict], listening_ports: Dict[int, Dict]):
        """
        Resolve ports for AS processes using netstat data.
        """
        for as_proc in as_processes:
            pid = as_proc['pid']
            
            # Find matching port by PID
            for port, port_info in listening_ports.items():
                if port_info['pid'] == pid:
                    as_proc['port'] = port
                    as_proc['connection_string'] = f"Data Source=localhost:{port}"
                    as_proc['verified_listening'] = True
                    break
    
    def _combine_instances_ultra_fast(self, pbi_processes: List[Dict], as_processes: List[Dict]) -> List[Dict]:
        """
        Ultra-fast combination of PBI Desktop and AS instances.
        """
        combined = []
        
        # Add PBI Desktop processes first
        for pbi_proc in pbi_processes:
            # Simple heuristic: match with first available AS process with port
            for as_proc in as_processes:
                if as_proc.get('port'):
                    pbi_proc.update({
                        'analysis_services_port': as_proc['port'],
                        'connection_string': as_proc['connection_string'],
                        'analysis_services_info': as_proc
                    })
                    break
            
            combined.append(pbi_proc)
        
        # Add standalone AS instances
        used_pids = {inst.get('analysis_services_info', {}).get('pid') for inst in combined}
        
        for as_proc in as_processes:
            if as_proc['pid'] not in used_pids:
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


# Ultra-fast detection function for MCP tools
def detect_powerbi_desktop_instances_ultra_fast() -> Dict:
    """
    Ultra-fast detection of Power BI Desktop instances using optimized methods.
    
    Returns:
        Dictionary with detected instances and performance metrics
    """
    detector = UltraFastPowerBIDesktopDetector()
    result = detector.detect_ultra_fast()
    return result
