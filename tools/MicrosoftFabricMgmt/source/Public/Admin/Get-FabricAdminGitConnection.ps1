<#
.SYNOPSIS
    Gets Git connections from the admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminGitConnection cmdlet retrieves Git connections using the admin API endpoint.
    This provides tenant-wide visibility into all workspace Git connections.
    Requires Fabric Administrator permissions.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminGitConnection

    Lists all Git connections in the tenant.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 25 requests per minute.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminGitConnection {
    [CmdletBinding()]
    param (
        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/workspaces/discoverGitConnections" -f $script:FabricAuthContext.BaseUrl
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No Git connections returned from admin API." -Level Warning
                return $null
            }

            # Use Select-FabricResource for type decoration
            return Select-FabricResource -InputObject $response -ResourceType 'AdminGitConnection' -TypeName 'MicrosoftFabric.AdminGitConnection' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Git connections from admin API. Error: $errorDetails" -Level Error
        }
    }
}
