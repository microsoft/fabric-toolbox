"""Unified discovery for Power BI Desktop instances and Service datasets."""

from typing import List, Dict, Any, Optional


def discover_datasets(
    workspace_name: Optional[str] = None,
    xmla_endpoint: Optional[str] = None
) -> Dict[str, Any]:
    """Unified discovery of datasets - either desktop instances or service datasets.
    
    Desktop Discovery (no parameters): Returns all local Power BI Desktop instances with their datasets
    Service Discovery (workspace_name or xmla_endpoint): Returns all datasets in the specified workspace/endpoint
    """
    
    if not workspace_name and not xmla_endpoint:
        return _discover_desktop_instances()
    
    # Service discovery - workspace or endpoint provided
    return _discover_service_datasets(workspace_name, xmla_endpoint)


def _discover_desktop_instances() -> Dict[str, Any]:
    """Discover local Power BI Desktop instances and their datasets."""
    try:
        import psutil
        
        instances = []
        
        listening_ports = {}
        for conn in psutil.net_connections(kind='tcp'):
            if conn.status == 'LISTEN' and conn.laddr.ip == '127.0.0.1':
                listening_ports[conn.pid] = conn.laddr.port
        
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                if proc.info['name'] == 'msmdsrv.exe':
                    pid = proc.info['pid']
                    if pid in listening_ports:
                        port = listening_ports[pid]
                        
                        parent_name = None
                        window_title = None
                        
                        try:
                            as_process = psutil.Process(pid)
                            parent = as_process.parent()
                            
                            if parent:
                                parent_name = parent.name()
                                
                                try:
                                    import win32gui
                                    import win32process
                                    
                                    def enum_windows_callback(hwnd, results):
                                        if win32gui.IsWindowVisible(hwnd):
                                            _, window_pid = win32process.GetWindowThreadProcessId(hwnd)
                                            if window_pid == parent.pid:
                                                window_text = win32gui.GetWindowText(hwnd)
                                                if window_text:
                                                    results.append(window_text)
                                    
                                    window_titles = []
                                    win32gui.EnumWindows(enum_windows_callback, window_titles)
                                    
                                    if window_titles:
                                        window_title = window_titles[0]
                                except (ImportError, Exception):
                                    window_title = f"{parent_name} (PID: {parent.pid})"
                        except Exception:
                            pass
                        
                        datasets = _list_databases_on_endpoint(f"localhost:{port}")
                        
                        instances.append({
                            'port': port,
                            'window_title': window_title,
                            'parent_process_name': parent_name,
                            'datasets': datasets
                        })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        instances.sort(key=lambda x: x['port'])
        
        if not instances:
            return {
                "status": "success",
                "discovery_type": "desktop",
                "instances": [],
                "message": "No Power BI Desktop instances found running. Please ensure Power BI Desktop is open with a model loaded."
            }
        
        return {
            "status": "success",
            "discovery_type": "desktop",
            "instances": instances,
            "message": f"Found {len(instances)} Power BI Desktop instance(s)"
        }
        
    except ImportError:
        return {
            "status": "error",
            "error": "psutil library not available. Install with: pip install psutil"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": f"Failed to discover desktop instances: {str(e)}"
        }


def _discover_service_datasets(workspace_name: Optional[str], xmla_endpoint: Optional[str]) -> Dict[str, Any]:
    """Discover datasets in a Power BI Service workspace."""
    try:
        from .xmla import determine_xmla_endpoint, is_desktop_connection
        
        endpoint, resolved_workspace = determine_xmla_endpoint(workspace_name, xmla_endpoint)
        
        datasets = _list_databases_on_endpoint(endpoint)
        
        is_desktop = is_desktop_connection(endpoint)
        
        if not datasets:
            return {
                "status": "success",
                "discovery_type": "service" if not is_desktop else "desktop",
                "workspace_name": resolved_workspace,
                "xmla_endpoint": endpoint,
                "datasets": [],
                "message": f"No datasets found on {endpoint}"
            }
        
        return {
            "status": "success",
            "discovery_type": "service" if not is_desktop else "desktop",
            "workspace_name": resolved_workspace,
            "xmla_endpoint": endpoint,
            "datasets": datasets,
            "message": f"Found {len(datasets)} dataset(s) in {resolved_workspace}"
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": f"Failed to discover service datasets: {str(e)}"
        }


def _list_databases_on_endpoint(xmla_endpoint: str) -> List[Dict[str, Any]]:
    """List all databases available on an XMLA endpoint.
    
    Args:
        xmla_endpoint: XMLA endpoint URL (e.g., "localhost:57466")
        
    Returns:
        List of database information dictionaries
    """
    databases = []
    
    try:
        from ..config import get_project_root
        from .xmla import build_connection_string
        import clr
        
        tom_path = get_project_root() / "dotnet" / "Microsoft.AnalysisServices.Tabular.dll"
        if not tom_path.exists():
            return []
        
        clr.AddReference(str(tom_path))
        from Microsoft.AnalysisServices.Tabular import Server  # type: ignore
        
        try:
            connection_string = build_connection_string(xmla_endpoint)
        except ValueError:
            # Auth required but not available
            return []
        
        server = Server()
        server.Connect(connection_string)
        
        for db in server.Databases:
            db_info = {
                'name': db.Name,
                'id': db.ID,
            }
            databases.append(db_info)
        
        server.Disconnect()
        
    except Exception:
        pass
    
    return databases
