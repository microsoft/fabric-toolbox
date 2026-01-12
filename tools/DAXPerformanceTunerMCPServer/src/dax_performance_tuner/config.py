"""Central configuration constants for the DAX Performance Tuner."""

from pathlib import Path


def get_project_root() -> Path:
    """Return the project root directory (3 levels up from this config file)."""
    return Path(__file__).parent.parent.parent


# Authentication
CLIENT_ID = "ea0616ba-638b-4df5-95b9-636659ae5121"
AUTHORITY = "https://login.microsoftonline.com/common"
# Power BI XMLA scope
SCOPES = ["https://analysis.windows.net/powerbi/api/.default"]
# Refresh five minutes before expiry
TOKEN_REFRESH_BUFFER_SECONDS = 300
AUTH_ERROR_PATTERNS = [
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

PERFORMANCE_THRESHOLDS = {
    "improvement_threshold_percent": 10.0,  # Minimum improvement to consider successful
    "max_total_time_ms": 120000,           # Maximum acceptable total time (120 seconds)
    "significant_improvement_percent": 20.0,  # Threshold for "significant" improvement
}
DAX_EXECUTION_RUNS = 3
DAX_EXECUTION_TIMEOUT_SECONDS = 600
DAX_FORMATTER_TIMEOUT_SECONDS = 30
DAX_EXECUTOR_RELATIVE_PATH = "dax_executor/bin/Release/net8.0-windows/win-x64/DaxExecutor.exe"
RESEARCH_REQUEST_TIMEOUT = 30
RESEARCH_MAX_WORKERS = 8
RESEARCH_MIN_CONTENT_LENGTH = 200
