<#
.SYNOPSIS
Automatically refreshes the Fabric API authentication token.

.DESCRIPTION
The `Invoke-TokenRefresh` function attempts to refresh the authentication token using the stored authentication method and credentials. Supports Service Principal and Managed Identity authentication methods. User Principal authentication requires interactive login and cannot be automatically refreshed.

.EXAMPLE
Invoke-TokenRefresh

Attempts to refresh the token using the stored authentication context.

.OUTPUTS
System.Boolean
Returns $true if refresh succeeded, $false if refresh failed.

.NOTES
API Endpoint: N/A (Authentication only)
Permissions Required: Appropriate Azure AD permissions for chosen auth method
Authentication: This IS the authentication function

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07

BREAKING CHANGE: Uses internal $script:FabricAuthContext instead of global $FabricConfig.
#>
function Invoke-TokenRefresh {
    [CmdletBinding()]
    [OutputType([System.Boolean])]
    param ()

    try {
        Write-PSFMessage -Level Verbose -Message "Attempting automatic token refresh"

        # Validate that we have authentication context
        if (-not $script:FabricAuthContext.AuthMethod) {
            Write-PSFMessage -Level Warning -Message "No authentication method stored. Cannot refresh token automatically."
            return $false
        }

        $authMethod = $script:FabricAuthContext.AuthMethod

        # User Principal requires interactive login - cannot auto-refresh
        if ($authMethod -eq 'UserPrincipal') {
            Write-PSFMessage -Level Warning -Message "User Principal authentication requires interactive login. Please run Set-FabricApiHeaders with -TenantId parameter."
            return $false
        }

        Write-PSFMessage -Level Debug -Message "Refreshing token using $authMethod method"

        # Refresh based on authentication method
        switch ($authMethod) {
            'ServicePrincipal' {
                # Service Principal requires stored credentials - cannot auto-refresh
                # This would require storing the AppSecret which is a security risk
                Write-PSFMessage -Level Warning -Message "Service Principal authentication cannot be automatically refreshed. Please run Set-FabricApiHeaders again with credentials."
                return $false
            }
            'ManagedIdentity' {
                Write-PSFMessage -Level Debug -Message "Refreshing Managed Identity token"

                # Retrieve the access token
                $resourceUrl = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.ResourceUrl'

                $fabricToken = Get-AzAccessToken -AsSecureString -ResourceUrl $resourceUrl -ErrorAction Stop -WarningAction SilentlyContinue

                # Convert secure token to plain text (PS 5.1 compatible)
                Write-PSFMessage -Level Debug -Message "Extracting token from SecureString"
                $plainTokenPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($fabricToken.Token)
                try {
                    $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($plainTokenPtr)

                    # Update module-scoped authentication context
                    Write-PSFMessage -Level Debug -Message "Updating module authentication context with refreshed token"

                    $script:FabricAuthContext.FabricHeaders = @{
                        'Content-Type'  = 'application/json; charset=utf-8'
                        'Authorization' = "Bearer $plainToken"
                    }
                    $script:FabricAuthContext.TokenExpiresOn = $fabricToken.ExpiresOn.ToString('o')  # ISO 8601 format

                    # Calculate time until expiration
                    $expiresIn = ($fabricToken.ExpiresOn - [DateTimeOffset]::Now).TotalMinutes
                    Write-PSFMessage -Level Verbose -Message "Token refreshed successfully. New token expires in $([Math]::Round($expiresIn, 1)) minutes."
                    Write-PSFMessage -Level Debug -Message "Token expiration: $($fabricToken.ExpiresOn.ToString('u'))"

                    return $true
                }
                finally {
                    # Ensure secure memory cleanup
                    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($plainTokenPtr)
                }
            }
        }

        return $false
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-PSFMessage -Level Error -Message "Failed to refresh authentication token: $errorDetails" -ErrorRecord $_
        return $false
    }
}
