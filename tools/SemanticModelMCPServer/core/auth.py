"""
Authentication module for Power BI access with comprehensive token management.

Provides MSAL-based authentication for Power BI REST API and XMLA endpoints.
Handles interactive authentication, automatic token refresh, and persistent
token caching for seamless user experience across all DAX Performance Tuner tools.

Features:
- Interactive browser-based authentication
- Automatic silent token refresh 
- Persistent token caching across sessions
- Thread-safe token management
- Graceful handling of token expiry scenarios

Uses Power BI Desktop client ID for maximum compatibility with Power BI service.
"""

import time
import threading
from typing import Optional, Dict, Any
from msal import PublicClientApplication

# Configuration
CLIENT_ID = "ea0616ba-638b-4df5-95b9-636659ae5121"  # Power BI Desktop client ID
AUTHORITY = "https://login.microsoftonline.com/common"
SCOPES = ["https://analysis.windows.net/powerbi/api/.default"]

# Global state
_access_token: Optional[str] = None
_token_expiry: Optional[float] = None
_refresh_token: Optional[str] = None
_auth_app: Optional[PublicClientApplication] = None
_token_lock = threading.Lock()
_last_successful_account: Optional[Dict[str, Any]] = None

# Token refresh buffer - refresh 5 minutes before expiry
TOKEN_REFRESH_BUFFER_SECONDS = 300


def is_auth_error(error_message: str) -> bool:
    """
    Check if error message indicates authentication failure.
    
    Analyzes error messages to identify various authentication-related failures
    that can occur during Power BI API calls and XMLA operations.
    
    Args:
        error_message: Error message string to analyze
        
    Returns:
        bool: True if error indicates authentication failure, False otherwise
        
    Detected Error Patterns:
        - DMTS_OAuthTokenRefreshFailedError: OAuth token refresh failures
        - "refresh token has expired": Token expiry notifications
        - AADSTS700082/700084: Azure AD specific auth errors
        - "token was issued": Token validation failures
        - "inactive for": Inactivity-based token expiry
        - "Authentication failed": General auth failures
        - "access token": Access token related errors
        - "token has expired": Generic token expiry
        - "token is invalid": Token validation errors
        
    Usage:
        Used by XMLA operations and API calls to detect when authentication
        retry logic should be triggered automatically.
    """
    auth_error_patterns = [
        "DMTS_OAuthTokenRefreshFailedError",
        "refresh token has expired",
        "AADSTS700082",
        "token was issued",
        "inactive for",
        "Authentication failed",
        "access token",
        "token has expired",
        "AADSTS700084",
        "token is invalid"
    ]
    
    error_lower = error_message.lower()
    return any(pattern.lower() in error_lower for pattern in auth_error_patterns)


def is_refresh_token_expired(error_message: str) -> bool:
    """
    Check if error specifically indicates refresh token expiry requiring full re-authentication.
    
    Detects specific refresh token expiration scenarios that require clearing
    the token cache and forcing fresh interactive authentication, rather than
    simple token refresh attempts.
    
    Args:
        error_message: Error message string to analyze
        
    Returns:
        bool: True if error indicates refresh token expiry, False otherwise
        
    Detected Error Patterns:
        - "refresh token has expired due to inactivity": 90-day inactivity timeout
        - "inactive for 90.00:00:00": Specific Azure AD inactivity error
        - AADSTS700082: The refresh token has expired due to inactivity
        - AADSTS700084: The refresh token is invalid due to inactivity
        
    Usage:
        Used to determine when token cache should be completely cleared
        and fresh interactive authentication should be forced, rather than
        attempting silent token refresh which will fail.
        
    Note:
        This is a subset of is_auth_error() - all refresh token expired
        errors are auth errors, but not all auth errors are refresh token
        expiry (some can be resolved with simple token refresh).
    """
    refresh_token_patterns = [
        "refresh token has expired due to inactivity",
        "inactive for 90.00:00:00",
        "AADSTS700082",
        "AADSTS700084"
    ]
    
    error_lower = error_message.lower()
    return any(pattern.lower() in error_lower for pattern in refresh_token_patterns)


def _initialize_app():
    """Initialize MSAL application if not already done"""
    global _auth_app
    if not _auth_app:
        _auth_app = PublicClientApplication(
            CLIENT_ID,
            authority=AUTHORITY
        )
    return _auth_app


def _is_token_expired() -> bool:
    """Check if token is expired or about to expire"""
    if not _access_token or not _token_expiry:
        return True
    return time.time() >= (_token_expiry - TOKEN_REFRESH_BUFFER_SECONDS)


def _try_silent_token_acquisition() -> Optional[Dict[str, Any]]:
    """
    Internal function to attempt silent token acquisition using cached credentials.
    
    Tries multiple cached accounts to find one that can provide a valid token
    without user interaction. Prioritizes the last successful account for
    efficiency.
    
    Returns:
        Dict[str, Any]: MSAL result with access token if successful, None otherwise
        
    Strategy:
        1. Try last successful account first (fastest)
        2. Iterate through all cached accounts
        3. Return first successful token acquisition
    """
    app = _initialize_app()
    accounts = app.get_accounts()
    
    # Try the last successful account first
    if _last_successful_account and _last_successful_account in accounts:
        result = app.acquire_token_silent(SCOPES, account=_last_successful_account)
        if result and 'access_token' in result:
            return result
    
    # Try all available accounts
    for account in accounts:
        result = app.acquire_token_silent(SCOPES, account=account)
        if result and 'access_token' in result:
            return result
    
    return None


def _update_token_cache(result: Dict[str, Any]) -> bool:
    """
    Internal function to update global token cache with new authentication result.
    
    Thread-safe update of all cached authentication data including access token,
    expiry time, refresh token, and successful account reference.
    
    Args:
        result: MSAL authentication result dictionary
        
    Returns:
        bool: True if cache updated successfully, False otherwise
        
    Updates:
        - Access token and expiry timestamp
        - Refresh token (if provided)
        - Last successful account reference
    """
    global _access_token, _token_expiry, _refresh_token, _last_successful_account
    
    if result and 'access_token' in result:
        _access_token = result['access_token']
        _token_expiry = time.time() + result.get('expires_in', 3600)
        _refresh_token = result.get('refresh_token')
        
        # Store the account that worked for future silent acquisitions
        if 'account' in result:
            _last_successful_account = result['account']
        
        return True
    return False


def force_token_refresh() -> bool:
    """
    Force complete token refresh cycle to resolve authentication issues.
    
    When authentication errors occur during API calls, this function provides
    a comprehensive reset that clears all cached credentials and forces fresh
    interactive authentication. More aggressive than standard token refresh.
    
    Returns:
        bool: True if refresh successful, False otherwise
        
    Process:
        1. Clears current token cache
        2. Attempts silent token acquisition
        3. If silent fails, removes all cached accounts
        4. Forces fresh interactive authentication with login prompt
        
    Use Cases:
        - 401/403 errors during API calls
        - Token corruption or invalid refresh tokens
        - Account switching requirements
        - Persistent authentication failures
    """
    global _access_token, _token_expiry, _refresh_token
    
    with _token_lock:
        print("Forcing token refresh due to authentication error...")
        
        # Clear current token
        _access_token = None
        _token_expiry = None
        
        # Try silent acquisition first
        result = _try_silent_token_acquisition()
        if result:
            if _update_token_cache(result):
                print("Token refreshed successfully (silent)")
                return True
        
        # If silent acquisition failed, we need fresh interactive auth
        print("Silent refresh failed, clearing all cached credentials...")
        
        # Clear the entire token cache including refresh tokens
        clear_token_cache()
        
        # Try to remove all cached accounts to force fresh login
        app = _initialize_app()
        accounts = app.get_accounts()
        for account in accounts:
            try:
                app.remove_account(account)
                print(f"Removed cached account: {account.get('username', 'unknown')}")
            except:
                pass  # Some accounts might not be removable
        
        # Force fresh interactive authentication
        print("Requesting fresh interactive authentication...")
        
        try:
            result = app.acquire_token_interactive(
                scopes=SCOPES,
                prompt="login",  # Force fresh login, not just account selection
                parent_window_handle=None
            )
            
            if _update_token_cache(result):
                print("Token refreshed successfully (fresh interactive)")
                return True
            else:
                error_desc = result.get('error_description', 'Unknown error') if result else 'No result'
                print(f"Interactive authentication failed: {error_desc}")
                return False
                
        except Exception as e:
            print(f"Interactive authentication exception: {str(e)}")
            return False


def get_access_token() -> Optional[str]:
    """
    Get valid access token with automatic refresh handling.
    
    Primary authentication function used by all tools. Automatically handles
    token expiry by attempting silent refresh first, falling back to interactive
    authentication if needed.
    
    Returns:
        str: Valid access token if authentication successful, None otherwise
        
    Features:
        - Automatic silent token refresh when possible
        - Interactive authentication fallback
        - Thread-safe operation
        - Comprehensive error handling
        
    Note:
        This function may trigger interactive authentication dialog if silent
        refresh fails or no cached tokens exist.
    """
    global _access_token, _token_expiry
    
    with _token_lock:
        # Check if we have a valid cached token
        if not _is_token_expired():
            return _access_token
        
        print("Token expired or missing, attempting refresh...")
        
        # Try silent token acquisition first
        result = _try_silent_token_acquisition()
        if result:
            if _update_token_cache(result):
                print("Authentication successful (silent refresh)")
                return _access_token
        
        # Fall back to interactive authentication
        print("Silent refresh failed, requesting interactive authentication...")
        app = _initialize_app()
        
        try:
            result = app.acquire_token_interactive(
                scopes=SCOPES,
                prompt="select_account",
                parent_window_handle=None
            )
            
            if _update_token_cache(result):
                print("Authentication successful (interactive)")
                return _access_token
            else:
                error_desc = result.get('error_description', 'Unknown error') if result else 'No result'
                print(f"Authentication failed: {error_desc}")
                return None
                
        except Exception as e:
            print(f"Authentication exception: {str(e)}")
            return None


def clear_token_cache():
    """
    Clear all cached authentication tokens and account information.
    
    Completely resets authentication state by clearing access tokens,
    refresh tokens, expiry times, and cached account references. Forces
    fresh authentication on next token request.
    
    Thread-safe operation that can be called from any context.
    
    Use Cases:
        - Account switching
        - Authentication troubleshooting
        - Security compliance (logout)
        - Development/testing scenarios
        
    Note:
        Next authentication call will require interactive login.
    """
    global _access_token, _token_expiry, _refresh_token, _last_successful_account
    
    with _token_lock:
        _access_token = None
        _token_expiry = None
        _refresh_token = None
        _last_successful_account = None
        print("Token cache cleared")


def get_token_info() -> Dict[str, Any]:
    """
    Get comprehensive information about current authentication state.
    
    Provides detailed token status for debugging, monitoring, and user
    interface display purposes. Includes token presence, expiry details,
    and cache status information.
    
    Returns:
        Dict[str, Any]: Token status information containing:
            - has_token: Whether access token exists
            - token_expiry: Unix timestamp of token expiration
            - expires_in_seconds: Seconds until expiration (None if no token)
            - is_expired: Whether current token is expired
            - has_refresh_token: Whether refresh token is cached
            - has_cached_account: Whether account info is cached
            
    Used for:
        - Authentication status checks
        - User interface state updates
        - Debugging authentication issues
        - Proactive token refresh scheduling
    """
    return {
        "has_token": _access_token is not None,
        "token_expiry": _token_expiry,
        "expires_in_seconds": (_token_expiry - time.time()) if _token_expiry else None,
        "is_expired": _is_token_expired(),
        "has_refresh_token": _refresh_token is not None,
        "has_cached_account": _last_successful_account is not None
    }


def get_authentication_status() -> Dict[str, Any]:
    """
    Get comprehensive authentication status for error handling and troubleshooting.
    
    This function provides the authentication diagnostics previously available
    through the authenticate() tool, now used internally for enhanced error
    messages in other tools.
    
    Returns:
        Dict[str, Any]: Comprehensive authentication status including:
            - status: success/failed/error
            - authentication_state: Current state description
            - message: Human-readable status message
            - token_info: Detailed token information
            - recommendations: List of suggested actions
            - troubleshooting: Dict of troubleshooting steps
    """
    try:
        # Step 1: Get current token info
        token_info = get_token_info()
        
        # Step 2: Try to get a valid access token (handles refresh automatically)
        token = get_access_token()
        
        # Step 3: Determine authentication state and actions taken
        if token:
            # Success - we have a valid token
            expires_in_seconds = token_info.get("expires_in_seconds", 0)
            
            # Calculate human-readable expiry
            if expires_in_seconds and expires_in_seconds > 0:
                hours = int(expires_in_seconds // 3600)
                minutes = int((expires_in_seconds % 3600) // 60)
                expires_in_human = f"{hours}h {minutes}m"
            else:
                expires_in_human = "Unknown"
            
            # Determine authentication method used
            auth_method = "cached" if token_info.get("has_cached_account") else "interactive"
            
            status = {
                "status": "success",
                "authentication_state": "authenticated",
                "message": "Authentication successful and ready for DAX optimization",
                "token_info": {
                    "token_present": True,
                    "token_expired": False,
                    "expires_in_human": expires_in_human,
                    "expires_in_seconds": expires_in_seconds,
                    "authentication_method": auth_method
                },
                "recommendations": [
                    "Authentication is healthy and ready for optimization workflow",
                    "You can now proceed with workspace and dataset discovery"
                ]
            }
            
            # Add warning if token expires soon
            if expires_in_seconds and expires_in_seconds < 1800:  # 30 minutes
                status["recommendations"].append("Token expires soon - will auto-refresh when needed")
            
            return status
            
        else:
            # Failed to get token - provide detailed troubleshooting
            return {
                "status": "failed",
                "authentication_state": "needs_authentication",
                "message": "Authentication failed - interactive login required",
                "token_info": {
                    "token_present": False,
                    "token_expired": True,
                    "has_cached_account": token_info.get("has_cached_account", False)
                },
                "recommendations": [
                    "Try the operation again (will trigger browser login)",
                    "If issues persist, check your Power BI account access",
                    "Ensure you have access to Power BI Premium workspaces for optimization"
                ],
                "troubleshooting": {
                    "check_permissions": "Verify your account has Power BI Pro/Premium license",
                    "test_connectivity": "Check if you can access https://app.powerbi.com",
                    "retry_operation": "Authentication errors are often temporary - try again"
                }
            }
            
    except Exception as e:
        # Error during authentication process
        error_message = str(e)
        
        # Check for specific error patterns and auto-clear cache if needed
        if is_refresh_token_expired(error_message):
            clear_token_cache()
            return {
                "status": "error",
                "authentication_state": "refresh_token_expired",
                "message": "Refresh token expired - cache cleared, retry authentication",
                "action_taken": "Automatically cleared token cache",
                "recommendations": [
                    "Refresh token expired - this is normal after extended periods",
                    "Try the operation again for fresh browser login"
                ]
            }
        
        return {
            "status": "error", 
            "authentication_state": "error",
            "message": f"Authentication error: {error_message}",
            "recommendations": [
                "Check your internet connection",
                "Verify your Power BI account is active",
                "Try the operation again"
            ],
            "troubleshooting": {
                "network": "Ensure internet connectivity to login.microsoftonline.com",
                "account": "Verify Power BI account at https://app.powerbi.com",
                "retry": "Authentication errors are often temporary"
            }
        }
