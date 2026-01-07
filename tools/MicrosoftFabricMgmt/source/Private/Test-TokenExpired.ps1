<#
.SYNOPSIS
Checks if the Fabric authentication token is expired or nearing expiration.

.DESCRIPTION
The `Test-TokenExpired` function checks the expiration status of the Fabric authentication token stored in the module-scoped `$script:FabricAuthContext` variable. Optionally attempts automatic token refresh when the token is expired or nearing expiration (< 5 minutes remaining).

.PARAMETER AutoRefresh
If specified, attempts to automatically refresh the token when it is expired or nearing expiration. Only works for Managed Identity authentication.

.EXAMPLE
Test-TokenExpired

Checks if the token is expired and returns $true if expired, $false if valid.

.EXAMPLE
Test-TokenExpired -AutoRefresh

Checks if the token is expired and attempts automatic refresh if needed.

.OUTPUTS
System.Boolean
Returns $true if the token is expired or missing, $false if valid.

.NOTES
API Endpoint: N/A (Authentication validation only)
Permissions Required: None (validation only)
Authentication: Validates existing authentication

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07

BREAKING CHANGE: Uses internal $script:FabricAuthContext instead of global $FabricConfig.
Now returns boolean instead of throwing exceptions for better error handling.
#>
function Test-TokenExpired {
    [CmdletBinding()]
    [OutputType([System.Boolean])]
    param (
        [Parameter(Mandatory = $false)]
        [switch]$AutoRefresh
    )

    try {
        Write-PSFMessage -Level Debug -Message "Checking authentication token expiration status"

        # Check if authentication context exists
        if (-not $script:FabricAuthContext) {
            Write-PSFMessage -Level Warning -Message "Authentication context not initialized. Please run Set-FabricApiHeaders to authenticate."
            return $true  # Token is effectively expired/missing
        }

        # Ensure required properties have valid values
        if ([string]::IsNullOrWhiteSpace($script:FabricAuthContext.TenantId) -or
            [string]::IsNullOrWhiteSpace($script:FabricAuthContext.TokenExpiresOn)) {
            Write-PSFMessage -Level Warning -Message "Token details are missing. Please run Set-FabricApiHeaders to configure authentication."
            return $true  # Token is effectively expired/missing
        }

        # Convert the TokenExpiresOn value to a DateTimeOffset object
        $tokenExpiryDate = [DateTimeOffset]::Parse($script:FabricAuthContext.TokenExpiresOn)

        # Get the token refresh threshold from configuration (default 5 minutes)
        $refreshThresholdSeconds = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Auth.TokenRefreshThresholdSeconds'
        $refreshThreshold = [DateTimeOffset]::Now.AddSeconds($refreshThresholdSeconds)

        # Check if the token is expired
        if ($tokenExpiryDate -le [DateTimeOffset]::Now) {
            Write-PSFMessage -Level Warning -Message "Authentication token has expired. Please run Set-FabricApiHeaders to refresh your session."

            # Attempt auto-refresh if requested
            if ($AutoRefresh.IsPresent) {
                Write-PSFMessage -Level Verbose -Message "Attempting automatic token refresh"
                $refreshed = Invoke-TokenRefresh
                if ($refreshed) {
                    Write-PSFMessage -Level Host -Message "Token automatically refreshed successfully"
                    return $false  # Token is now valid
                }
                else {
                    Write-PSFMessage -Level Warning -Message "Automatic token refresh failed. Please run Set-FabricApiHeaders to re-authenticate."
                    return $true  # Token is still expired
                }
            }

            return $true  # Token is expired
        }

        # Check if token is nearing expiration (proactive refresh)
        if ($tokenExpiryDate -le $refreshThreshold) {
            $minutesRemaining = ($tokenExpiryDate - [DateTimeOffset]::Now).TotalMinutes
            Write-PSFMessage -Level Verbose -Message "Token expires in $([Math]::Round($minutesRemaining, 1)) minutes. Consider refreshing soon."

            # Attempt proactive auto-refresh if requested
            if ($AutoRefresh.IsPresent) {
                Write-PSFMessage -Level Verbose -Message "Token nearing expiration. Attempting proactive refresh."
                $refreshed = Invoke-TokenRefresh
                if ($refreshed) {
                    Write-PSFMessage -Level Debug -Message "Token proactively refreshed successfully"
                    return $false  # Token is now valid
                }
                else {
                    Write-PSFMessage -Level Debug -Message "Proactive token refresh not available. Token still valid for $([Math]::Round($minutesRemaining, 1)) minutes."
                    return $false  # Token is still valid even though refresh failed
                }
            }
        }

        # Token is valid
        $minutesRemaining = ($tokenExpiryDate - [DateTimeOffset]::Now).TotalMinutes
        Write-PSFMessage -Level Debug -Message "Token is valid. Expires in $([Math]::Round($minutesRemaining, 1)) minutes at $($tokenExpiryDate.ToString('u'))"
        return $false  # Token is valid
    }
    catch [System.FormatException] {
        Write-PSFMessage -Level Error -Message "Invalid TokenExpiresOn format in authentication context. Expected ISO 8601 datetime string." -ErrorRecord $_
        return $true  # Treat as expired due to invalid format
    }
    catch {
        # Capture and log error details
        Write-PSFMessage -Level Error -Message "Unexpected error checking token expiration: $($_.Exception.Message)" -ErrorRecord $_
        return $true  # Treat as expired due to error
    }
}
