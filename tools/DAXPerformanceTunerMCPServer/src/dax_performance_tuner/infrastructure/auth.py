"""Minimal Azure AD auth helpers for the Power BI optimization session."""

import time
import threading
from typing import Optional, Dict, Any
from msal import PublicClientApplication
from ..config import (
    CLIENT_ID,
    AUTHORITY,
    SCOPES,
    TOKEN_REFRESH_BUFFER_SECONDS,
    AUTH_ERROR_PATTERNS,
)

# Global state
_access_token: Optional[str] = None
_token_expiry: Optional[float] = None
_auth_app: Optional[PublicClientApplication] = None
_token_lock = threading.Lock()
_app_init_lock = threading.Lock()


def is_auth_error(error_message: str) -> bool:
    """Return ``True`` when the provided message matches a known auth failure."""
    error_lower = error_message.lower()
    return any(pattern.lower() in error_lower for pattern in AUTH_ERROR_PATTERNS)


def _initialize_app() -> PublicClientApplication:
    """Return the cached MSAL application instance (create when missing)."""
    global _auth_app
    with _app_init_lock:
        if not _auth_app:
            _auth_app = PublicClientApplication(
                CLIENT_ID,
                authority=AUTHORITY
            )
    return _auth_app


def _is_token_expired() -> bool:
    """True when no token is cached or the expiry buffer has elapsed."""
    return not _access_token or not _token_expiry or time.time() >= (_token_expiry - TOKEN_REFRESH_BUFFER_SECONDS)


def _try_silent_token_acquisition() -> Optional[Dict[str, Any]]:
    """Attempt silent token acquisition using cached MSAL accounts."""
    app = _initialize_app()
    accounts = app.get_accounts()
    
    for account in accounts:
        result = app.acquire_token_silent(SCOPES, account=account)
        if result and 'access_token' in result:
            return result
    
    return None


def _update_token_cache(result: Dict[str, Any]) -> bool:
    """Store access token details from an MSAL auth result."""
    global _access_token, _token_expiry
    
    if not result or 'access_token' not in result:
        return False
    
    _access_token = result['access_token']
    _token_expiry = time.time() + result.get('expires_in', 3600)
    return True


def force_token_refresh() -> bool:
    """Clear caches and trigger a fresh authentication round."""
    global _access_token, _token_expiry
    
    with _token_lock:
        _access_token = None
        _token_expiry = None

        result = _try_silent_token_acquisition()
        if _update_token_cache(result):
            return True

        app = _initialize_app()
        accounts = app.get_accounts()
        for account in accounts:
            app.remove_account(account)

        try:
            result = app.acquire_token_interactive(
                scopes=SCOPES,
                prompt="login",
                parent_window_handle=None
            )
            return _update_token_cache(result)
        except Exception:
            return False


def get_access_token() -> Optional[str]:
    """Return a valid access token, prompting the user when needed."""
    global _access_token, _token_expiry
    
    with _token_lock:
        if not _is_token_expired():
            return _access_token

        result = _try_silent_token_acquisition()
        if _update_token_cache(result):
            return _access_token

        app = _initialize_app()
        try:
            result = app.acquire_token_interactive(
                scopes=SCOPES,
                prompt="select_account",
                parent_window_handle=None
            )
            if _update_token_cache(result):
                return _access_token
            return None
        except Exception:
            return None


def get_access_token_with_expiry() -> Optional[tuple[str, float]]:
    """Return a valid access token and its expiry timestamp.
    
    Returns:
        Tuple of (access_token, expiry_timestamp) or None if auth fails.
        expiry_timestamp is Unix epoch time (seconds since 1970-01-01 UTC).
    """
    global _access_token, _token_expiry
    
    # Ensure we have a valid token
    token = get_access_token()
    if not token:
        return None
    
    # Return token and expiry time (already set by get_access_token)
    with _token_lock:
        return (_access_token, _token_expiry) if _access_token and _token_expiry else None
