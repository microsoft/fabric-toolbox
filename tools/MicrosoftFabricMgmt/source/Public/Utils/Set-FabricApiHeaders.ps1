<#
.SYNOPSIS
Sets the Fabric API headers with a valid token for the specified Azure tenant.

.DESCRIPTION
The `Set-FabricApiHeaders` function authenticates to Azure and retrieves an access token for the Fabric API.
Supports three authentication methods:
- User Principal (interactive)
- Service Principal (automated)
- Managed Identity (Azure resources)

.PARAMETER TenantId
The Azure Active Directory tenant (directory) GUID. Required for User Principal and Service Principal authentication.

.PARAMETER AppId
Client/Application ID (GUID) of the Azure AD application for service principal authentication.
Must be used together with AppSecret parameter.

.PARAMETER AppSecret
Secure string containing the client secret for service principal authentication.
Convert plain text using: `ConvertTo-SecureString -AsPlainText -Force`

.PARAMETER UseManagedIdentity
Switch to use Azure Managed Identity authentication. Suitable for Azure VMs, App Services, Functions, etc.

.PARAMETER ClientId
Optional. Client ID for user-assigned managed identity. Omit for system-assigned managed identity.

.EXAMPLE
Set-FabricApiHeaders -TenantId "12345678-1234-1234-1234-123456789012"

Authenticates using current user credentials (interactive).

.EXAMPLE
$appSecret = "your-secret" | ConvertTo-SecureString -AsPlainText -Force
Set-FabricApiHeaders -TenantId $tid -AppId $appId -AppSecret $appSecret

Authenticates using service principal (non-interactive).

.EXAMPLE
Set-FabricApiHeaders -UseManagedIdentity

Authenticates using system-assigned managed identity (Azure resources only).

.EXAMPLE
Set-FabricApiHeaders -UseManagedIdentity -ClientId "87654321-4321-4321-4321-210987654321"

Authenticates using user-assigned managed identity.

.OUTPUTS
None. Updates module-scoped authentication context.

.NOTES
API Endpoint: N/A (Authentication only)
Permissions Required: Appropriate Azure AD permissions for chosen auth method
Authentication: This IS the authentication function

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07

BREAKING CHANGE: No longer populates global $FabricConfig variable.
Module now uses internal $script:FabricAuthContext.
#>
function Set-FabricApiHeaders {
    [CmdletBinding(DefaultParameterSetName = 'UserPrincipal', SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ParameterSetName = 'UserPrincipal')]
        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [string]$TenantId,

        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [string]$AppId,

        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [System.Security.SecureString]$AppSecret,

        [Parameter(Mandatory = $true, ParameterSetName = 'ManagedIdentity')]
        [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', '', Justification='Parameter is used for parameter set binding')]
        [switch]$UseManagedIdentity,

        [Parameter(Mandatory = $false, ParameterSetName = 'ManagedIdentity')]
        [ValidateNotNullOrEmpty()]
        [string]$ClientId
    )

    try {
        $authMethod = $PSCmdlet.ParameterSetName
        Write-PSFMessage -Level Host -Message "Authenticating to Azure using $authMethod method..."

        if ($PSCmdlet.ShouldProcess("Fabric API configuration for $authMethod", "Set authentication headers")) {
            # Authenticate based on parameter set
            switch ($authMethod) {
                'ServicePrincipal' {
                    Write-PSFMessage -Level Debug -Message "Authenticating with Service Principal: $AppId"

                    # PS 5.1 compatible: Use New-Object instead of [pscredential]::new()
                    $psCredential = New-Object System.Management.Automation.PSCredential($AppId, $AppSecret)

                    # Connect to Azure
                    Connect-AzAccount -ServicePrincipal -Credential $psCredential -Tenant $TenantId -ErrorAction Stop | Out-Null
                    Write-PSFMessage -Level Verbose -Message "Successfully authenticated as service principal"
                }
                'UserPrincipal' {
                    Write-PSFMessage -Level Debug -Message "Authenticating with User Principal for tenant: $TenantId"

                    # Connect to Azure with user credentials
                    Connect-AzAccount -Tenant $TenantId -ErrorAction Stop | Out-Null
                    Write-PSFMessage -Level Verbose -Message "Successfully authenticated as user principal"
                }
                'ManagedIdentity' {
                    Write-PSFMessage -Level Debug -Message "Authenticating with Managed Identity"

                    # Build Connect-AzAccount parameters for MI
                    $connectParams = @{
                        Identity    = $true
                        ErrorAction = 'Stop'
                    }

                    # Add AccountId for user-assigned MI
                    if ($ClientId) {
                        $connectParams.AccountId = $ClientId
                        Write-PSFMessage -Level Verbose -Message "Using user-assigned managed identity: $ClientId"
                    }
                    else {
                        Write-PSFMessage -Level Verbose -Message "Using system-assigned managed identity"
                    }

                    # Connect using managed identity
                    Connect-AzAccount @connectParams | Out-Null
                    Write-PSFMessage -Level Verbose -Message "Successfully authenticated with managed identity"
                }
            }

            # Retrieve the access token
            Write-PSFMessage -Level Debug -Message "Retrieving access token for Fabric API"
            $resourceUrl = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.ResourceUrl'

            $fabricToken = Get-AzAccessToken -AsSecureString -ResourceUrl $resourceUrl -ErrorAction Stop -WarningAction SilentlyContinue

            # Convert secure token to plain text (PS 5.1 compatible)
            Write-PSFMessage -Level Debug -Message "Extracting token from SecureString"
            $plainTokenPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($fabricToken.Token)
            try {
                $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($plainTokenPtr)

                # Update module-scoped authentication context
                Write-PSFMessage -Level Debug -Message "Updating module authentication context"

                $script:FabricAuthContext.FabricHeaders = @{
                    'Content-Type'  = 'application/json; charset=utf-8'
                    'Authorization' = "Bearer $plainToken"
                }
                $script:FabricAuthContext.TokenExpiresOn = $fabricToken.ExpiresOn.ToString('o')  # ISO 8601 format
                $script:FabricAuthContext.TenantId = if ($TenantId) { $TenantId } else { 'ManagedIdentity' }
                $script:FabricAuthContext.AuthMethod = $authMethod
                $script:FabricAuthContext.ClientId = $ClientId

                # Calculate time until expiration
                $expiresIn = ($fabricToken.ExpiresOn - [DateTimeOffset]::Now).TotalMinutes
                Write-PSFMessage -Level Host -Message "Authentication successful. Token expires in $([Math]::Round($expiresIn, 1)) minutes."
                Write-PSFMessage -Level Verbose -Message "Token expiration: $($fabricToken.ExpiresOn.ToString('u'))"
            }
            finally {
                # Ensure secure memory cleanup
                [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($plainTokenPtr)
            }
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-PSFMessage -Level Error -Message "Failed to set Fabric authentication: $errorDetails" -ErrorRecord $_

        # Provide helpful error messages based on auth method
        $helpMessage = switch ($authMethod) {
            'ServicePrincipal' { "Verify AppId, AppSecret, and TenantId are correct. Ensure service principal has appropriate permissions." }
            'UserPrincipal' { "Verify TenantId is correct. Ensure you have appropriate permissions and can authenticate interactively." }
            'ManagedIdentity' { "Ensure managed identity is enabled on this Azure resource and has appropriate permissions. Managed Identity only works on Azure VMs, App Services, Functions, etc." }
        }

        Write-PSFMessage -Level Important -Message $helpMessage
        throw "Unable to configure Fabric authentication. $helpMessage"
    }
}
