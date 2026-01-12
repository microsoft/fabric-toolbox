<#
.SYNOPSIS
    Validates authentication token and optionally triggers automatic refresh.

.DESCRIPTION
    This helper function eliminates the repetitive 3-line authentication validation pattern
    used across all 244 public functions. It checks if the authentication token is valid
    and can optionally attempt automatic refresh for Managed Identity authentication.

.PARAMETER ThrowOnFailure
    If specified, throws an UnauthorizedAccessException when the token is expired.
    If not specified, returns $false when the token is expired.

.OUTPUTS
    System.Boolean
    Returns $true if authentication is valid, $false if expired (when -ThrowOnFailure is not used).

.EXAMPLE
    Invoke-FabricAuthCheck -ThrowOnFailure

    Validates authentication and throws an exception if the token is expired.

.EXAMPLE
    if (-not (Invoke-FabricAuthCheck)) {
        Write-Warning "Authentication expired"
        return
    }

    Validates authentication and handles expiration gracefully.

.NOTES
    This function wraps Test-TokenExpired and provides consistent error handling
    across all module functions.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Invoke-FabricAuthCheck {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter()]
        [switch]$ThrowOnFailure
    )

    Write-FabricLog -Message "Validating authentication token" -Level Debug

    # Test-TokenExpired with AutoRefresh will attempt to refresh if < 5 minutes remaining
    $isExpired = Test-TokenExpired -AutoRefresh

    if ($isExpired) {
        $message = "Authentication token has expired. Please run Set-FabricApiHeaders to authenticate."
        Write-FabricLog -Message $message -Level Error

        if ($ThrowOnFailure) {
            # Use New-Object for PowerShell 5.1 compatibility
            throw (New-Object System.UnauthorizedAccessException $message)
        }

        return $false
    }

    Write-FabricLog -Message "Authentication token is valid" -Level Debug

    # Only return $true when not using ThrowOnFailure (caller needs the boolean result)
    # When using ThrowOnFailure, don't output anything - caller only cares about exceptions
    if (-not $ThrowOnFailure) {
        return $true
    }
}
