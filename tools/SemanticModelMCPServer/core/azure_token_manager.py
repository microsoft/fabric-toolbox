"""
Azure Token Management Helper

This module provides functionality for managing Azure authentication tokens,
including caching and automatic refresh for SQL Server connections.
"""

import logging
import time
from datetime import datetime
from typing import Tuple, Optional

# Token cache for Azure authentication
# Structure: {scope: {"token": token_object, "expires_at": timestamp, "token_struct": packed_token}}
_token_cache = {}

def get_cached_azure_token(scope: str = "https://database.windows.net/.default") -> Tuple[Optional[bytes], bool, Optional[str]]:
    """
    Get a cached Azure token or fetch a new one if not cached or expired.
    
    Args:
        scope: The authentication scope for the token
        
    Returns:
        Tuple of (token_struct, success_flag, error_message)
    """
    import struct
    from azure import identity
    
    current_time = time.time()
    
    # Check if we have a valid cached token
    if scope in _token_cache:
        cached_entry = _token_cache[scope]
        if current_time < cached_entry["expires_at"]:
            # Token is still valid, return cached token_struct
            logging.debug(f"Using cached Azure token for scope: {scope}")
            return cached_entry["token_struct"], True, None
        else:
            logging.debug(f"Cached Azure token expired for scope: {scope}, fetching new token")
    else:
        logging.debug(f"No cached Azure token found for scope: {scope}, fetching new token")
    
    try:
        # Get new token
        credential = identity.DefaultAzureCredential(exclude_interactive_browser_credential=False)
        token = credential.get_token(scope)
        
        # Calculate expiration time with 5-minute buffer
        buffer_seconds = 300  # 5 minutes
        expires_at = token.expires_on - buffer_seconds
        
        # Encode token for SQL Server authentication
        token_bytes = token.token.encode("UTF-16-LE")
        token_struct = struct.pack(f'<I{len(token_bytes)}s', len(token_bytes), token_bytes)
        
        # Cache the token
        _token_cache[scope] = {
            "token": token,
            "expires_at": expires_at,
            "token_struct": token_struct
        }
        
        logging.debug(f"Cached new Azure token for scope: {scope}, expires at: {datetime.fromtimestamp(expires_at)}")
        return token_struct, True, None
        
    except Exception as e:
        return None, False, f"Failed to get Azure token: {str(e)}"

def clear_token_cache() -> None:
    """
    Clear the authentication token cache. 
    Useful for debugging or forcing token refresh.
    """
    global _token_cache
    _token_cache.clear()
    logging.debug("Azure token cache cleared")

def get_token_cache_status() -> dict:
    """
    Get the current status of the token cache.
    
    Returns:
        Dictionary containing cache status information
    """
    current_time = time.time()
    cache_status = {}
    
    for scope, cache_entry in _token_cache.items():
        expires_at = cache_entry["expires_at"]
        is_valid = current_time < expires_at
        time_until_expiry = expires_at - current_time if is_valid else 0
        
        cache_status[scope] = {
            "is_valid": is_valid,
            "expires_at": datetime.fromtimestamp(expires_at).isoformat(),
            "time_until_expiry_seconds": max(0, time_until_expiry)
        }
    
    return cache_status
