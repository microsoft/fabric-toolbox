<#
.SYNOPSIS
Sets the Fabric API headers with a valid token for the specified Azure tenant.

.DESCRIPTION
The `Set-FabricApiHeaders` function logs into the specified Azure tenant, retrieves an access token for the Fabric API, and sets the necessary headers for subsequent API requests.
It also updates the token expiration time and global tenant ID.

.PARAMETER TenantId
The Azure tenant ID for which the access token is requested.

.PARAMETER AppId
The Azure app ID for which the service principal access token is requested.

.PARAMETER AppSecret
The Azure App secret for which the service principal access token is requested.

.EXAMPLE
Set-FabricApiHeaders -TenantId "your-tenant-id"

Logs in to Azure with the specified tenant ID, retrieves an access token for the current user, and configures the Fabric headers.

.EXAMPLE
$tenantId = "999999999-99999-99999-9999-999999999999"
$appId = "888888888-88888-88888-8888-888888888888"
$appSecret = "your-app-secret"
$secureAppSecret = $appSecret | ConvertTo-SecureString -AsPlainText -Force

Set-FabricApiHeader -TenantId $tenantId -AppId $appId -AppSecret $secureAppSecret
Logs in to Azure with the specified tenant ID, retrieves an access token for the service principal, and configures the Fabric headers.

.NOTES
- Ensure the `Connect-AzAccount` and `Get-AzAccessToken` commands are available (Azure PowerShell module required).
- Relies on a global `$FabricConfig` object for storing headers and token metadata.

.AUTHOR
Author: Jess Pomfret and Rob Sewell updated November 2026
#>

function Set-FabricApiHeaders {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TenantId,
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AppId,
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Security.SecureString]$AppSecret
    )
    try {
        # Log the start of the Azure login process
        Write-Message -Message "Logging in to Azure tenant: $TenantId" -Level Info

        # Check if AppId and AppSecret are provided for service principal authentication
        if ($PSBoundParameters.ContainsKey('AppId') -and $PSBoundParameters.ContainsKey('AppSecret')) {
            # Log the use of service principal authentication
            Write-Message -Message "Logging in using the AppId: $AppId" -Level Debug

            # Create a credential object using AppId and AppSecret
            $psCredential = [pscredential]::new($AppId, $AppSecret)

            # Connect to Azure using service principal credentials
            Connect-AzAccount -ServicePrincipal -Credential $psCredential -Tenant $TenantId -ErrorAction Stop | Out-Null
        }
        else {
            # Log the use of current user authentication
            Write-Message -Message "Logging in using the current user" -Level Debug

            # Connect to Azure using the current user's credentials
            Connect-AzAccount -Tenant $TenantId -ErrorAction Stop | Out-Null
        }

        # Log the retrieval of the access token for the Fabric API
        Write-Message -Message "Retrieving the access token for the Fabric API: $TenantId" -Level Debug

        # Retrieve the access token securely for the specified resource URL
        $fabricToken = Get-AzAccessToken -AsSecureString -ResourceUrl $FabricConfig.ResourceUrl -ErrorAction Stop -WarningAction SilentlyContinue

        # Log the extraction of the plain token from the secure string
        Write-Message -Message "Extracting the plain token from the secure string" -Level Debug

        # Convert the secure token to a plain text token
        $plainTokenPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($fabricToken.Token)
        $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($plainTokenPtr)

        # Log the setting of headers in the global configuration
        Write-Message -Message "Setting headers in the global configuration" -Level Debug

        # Set the required headers for Fabric API requests
        $FabricConfig.FabricHeaders = @{
            'Content-Type'  = 'application/json'
            'Authorization' = "Bearer $plainToken"
        }

        # Log the update of token metadata in the global configuration
        Write-Message -Message "Updating token metadata in the global configuration" -Level Debug

        # Update token expiration and tenant ID metadata
        $FabricConfig.TokenExpiresOn = $fabricToken.ExpiresOn
        $FabricConfig.TenantIdGlobal = $TenantId

        # Log successful configuration of the Fabric token
        Write-Message -Message "Fabric token successfully configured." -Level Info
    }
    catch {
        # Capture and log error details if an exception occurs
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to set Fabric token: $errorDetails" -Level Error

        # Throw a descriptive error message
        throw "Unable to configure Fabric token. Ensure tenant and API configurations are correct."
    }
    finally {
        # Ensure secure memory cleanup of the plain token pointer
        if ($plainTokenPtr) {
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($plainTokenPtr)
        }
    }
}
