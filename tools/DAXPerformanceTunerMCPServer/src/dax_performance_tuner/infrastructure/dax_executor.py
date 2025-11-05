"""Thin wrapper around the .NET DaxExecutor console app."""

from typing import Any, Dict, Optional, Tuple
import subprocess
import json
import os
from ..config import get_project_root, DAX_EXECUTION_TIMEOUT_SECONDS, DAX_EXECUTOR_RELATIVE_PATH
from .auth import get_access_token
from .xmla import is_desktop_connection


def _extract_json_from_dax_output(raw_stdout: str) -> Optional[Dict[str, Any]]:
    """Extract JSON from mixed stdout produced by the executor.
    
    The DaxExecutor may produce mixed output containing debug/informational
    messages before or after the JSON result. This function finds the JSON
    block by locating the first line starting with '{' and the last line
    ending with '}', then parses that content.
    
    This is a fallback for when json.loads() fails on the raw stdout,
    typically due to extra logging or status messages from the .NET process.
    """
    try:
        # Look for JSON starting with { and ending with } on separate lines
        lines = raw_stdout.split('\n')
        json_start = -1
        json_end = -1
        
        # Find the start of JSON (first line that starts with {)
        for i, line in enumerate(lines):
            if line.strip().startswith('{'):
                json_start = i
                break
        
        if json_start == -1:
            return None
        
        # Find the end of JSON (last line that ends with })
        for i in range(len(lines) - 1, json_start - 1, -1):
            if lines[i].strip().endswith('}'):
                json_end = i
                break
        
        if json_end == -1:
            return None
        
        # Extract JSON lines and join them
        json_lines = lines[json_start:json_end + 1]
        json_str = '\n'.join(json_lines)
        
        # Parse JSON
        return json.loads(json_str)
        
    except Exception:
        return None


def execute_with_dax_executor(
    query: str,
    xmla_endpoint: str,
    dataset_name: str,
    access_token: str = None,
    timeout_seconds: int = None
) -> Tuple[bool, Dict[str, Any], Optional[str]]:
    """Execute DAX query using DaxExecutor.exe. Returns (success, result_data, error_message).
    
    Args:
        query: DAX query to execute
        xmla_endpoint: XMLA endpoint URL
        dataset_name: Dataset name
        access_token: Optional access token (will be fetched if not provided)
        timeout_seconds: Optional timeout in seconds
    """
    
    if timeout_seconds is None:
        timeout_seconds = DAX_EXECUTION_TIMEOUT_SECONDS
    
    executor_path = get_project_root() / "src" / DAX_EXECUTOR_RELATIVE_PATH
    
    if not executor_path.exists():
        return False, {}, f"DaxExecutor.exe not found at {executor_path}"
    
    is_desktop = is_desktop_connection(xmla_endpoint)
    
    # Get token for service connections
    if not access_token and not is_desktop:
        access_token = get_access_token()
        if not access_token:
            return False, {}, "No access token available"
    
    if is_desktop and not access_token:
        access_token = "desktop-no-auth-needed"
    
    try:
        # Build command WITHOUT token in args (security improvement)
        cmd = [
            str(executor_path),
            "--xmla", xmla_endpoint,
            "--dataset", dataset_name,
            "--query", query,
            "--verbose"
        ]
        
        # Pass token via stdin instead of command-line args (more secure)
        result = subprocess.run(
            cmd,
            input=access_token,  # Token passed via stdin
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            cwd=os.path.dirname(executor_path)
        )
        
        if result.returncode != 0:
            error_msg = f"DaxExecutor failed with return code {result.returncode}"
            if result.stderr:
                error_msg += f": {result.stderr.strip()}"
            return False, {}, error_msg
        
        if not result.stdout.strip():
            return False, {}, "DaxExecutor returned empty output"
        
        try:
            result_data = json.loads(result.stdout)
        except json.JSONDecodeError as e:
            # First attempt json.loads failed, try extracting JSON from mixed output
            result_data = _extract_json_from_dax_output(result.stdout)
            if result_data is None:
                return False, {}, f"Failed to parse DaxExecutor JSON output: {str(e)}"
        
        # Check if DAX execution resulted in an error
        performance_section = result_data.get("Performance", {})
        if performance_section.get("Error"):
            error_msg = performance_section.get("ErrorMessage") or "DAX query execution error"
            return False, result_data, error_msg
        
        return True, result_data, None
    
    except subprocess.TimeoutExpired as e:
        # Ensure process is terminated on timeout
        if e.process:
            try:
                e.process.kill()
                e.process.wait(timeout=5)
            except Exception:
                pass
        return False, {}, f"DaxExecutor execution timed out after {timeout_seconds} seconds"
    except Exception as e:
        return False, {}, f"Unexpected error executing DaxExecutor: {str(e)}"