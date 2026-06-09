<#
.SYNOPSIS
    Gets items that a specific user can access using the admin API.

.DESCRIPTION
    The Get-FabricAdminUserAccess cmdlet retrieves a list of permission details for Fabric and PowerBI items
    that the specified user can access. Requires Fabric Administrator permissions.

.PARAMETER UserId
    The user's graph ID or User Principal Name (UPN).

.PARAMETER ItemType
    Optional. Filter by item type.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminUserAccess -UserId "user@contoso.com"

    Lists all items the specified user can access.

.EXAMPLE
    Get-FabricAdminUserAccess -UserId "12345678-1234-1234-1234-123456789012" -ItemType "Lakehouse"

    Lists all Lakehouse items the specified user can access.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminUserAccess {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$UserId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemType,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/users/{1}/access" -f $script:FabricAuthContext.BaseUrl, $UserId

            # Add type query parameter if specified
            if ($ItemType) {
                $apiEndpointURI = "{0}?type={1}" -f $apiEndpointURI, $ItemType
            }

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No access entities returned from admin API for user '$UserId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Add context and type name for formatting
            foreach ($entity in $response) {
                $entity | Add-Member -NotePropertyName 'userId' -NotePropertyValue $UserId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminUserAccess'

            Write-FabricLog -Message "Retrieved $($response.Count) access entit(ies) for user '$UserId'." -Level Debug
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve user access from admin API. Error: $errorDetails" -Level Error
        }
    }
}
