<#
.SYNOPSIS
    Gets items from the admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminItem cmdlet retrieves Fabric and PowerBI items using the admin API endpoint.
    This provides tenant-wide visibility into all items (including those the user doesn't have access to).
    Requires Fabric Administrator permissions.

.PARAMETER WorkspaceId
    Optional. Filter items by workspace ID.

.PARAMETER ItemId
    Optional. Returns only the item matching this ID. Requires WorkspaceId.

.PARAMETER CapacityId
    Optional. Filter items by capacity ID.

.PARAMETER ItemType
    Optional. Filter items by type.

.PARAMETER State
    Optional. Filter by item state. Valid values: active.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminItem

    Lists all items in the tenant.

.EXAMPLE
    Get-FabricAdminItem -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all items in the specified workspace.

.EXAMPLE
    Get-FabricAdminItem -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the specific item.

.EXAMPLE
    Get-FabricAdminItem -ItemType "Lakehouse" -State "active"

    Lists all active Lakehouse items in the tenant.

.EXAMPLE
    Get-FabricAdminItem -CapacityId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists all items on the specified capacity.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminItem {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemType,

        [Parameter(Mandatory = $false)]
        [ValidateSet('active')]
        [string]$State,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate parameters
            if ($ItemId -and -not $WorkspaceId) {
                Write-FabricLog -Message "WorkspaceId is required when specifying ItemId." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # If ItemId and WorkspaceId provided, get specific item
            if ($ItemId -and $WorkspaceId) {
                $apiEndpointURI = "{0}/admin/workspaces/{1}/items/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ItemId
                Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    if ($Raw) {
                        return $response
                    }
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminItem')
                    return $response
                }
                return $null
            }

            # Build query parameters for list operation
            $queryParams = @{}
            if ($WorkspaceId) {
                $queryParams['workspaceId'] = $WorkspaceId
            }
            if ($CapacityId) {
                $queryParams['capacityId'] = $CapacityId
            }
            if ($ItemType) {
                $queryParams['type'] = $ItemType
            }
            if ($State) {
                $queryParams['state'] = $State
            }

            # Construct the API endpoint URI
            if ($queryParams.Count -gt 0) {
                $queryString = ($queryParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '&'
                $apiEndpointURI = "{0}/{1}?{2}" -f $script:FabricAuthContext.BaseUrl, 'admin/items', $queryString
            }
            else {
                $apiEndpointURI = "{0}/{1}" -f $script:FabricAuthContext.BaseUrl, 'admin/items'
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
                Write-FabricLog -Message "No items returned from admin API." -Level Debug
                return
            }

            # Use Select-FabricResource for type decoration
            return Select-FabricResource -InputObject $response -ResourceType 'AdminItem' -TypeName 'MicrosoftFabric.AdminItem' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve items from admin API. Error: $errorDetails" -Level Error
        }
    }
}
