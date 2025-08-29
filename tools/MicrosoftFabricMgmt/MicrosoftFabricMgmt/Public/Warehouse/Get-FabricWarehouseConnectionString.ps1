<#
.SYNOPSIS
Retrieves the connection string for a specific Warehouse in a Fabric workspace.

.DESCRIPTION
The Get-FabricWarehouseConnectionString function retrieves the connection string for a given Warehouse within a specified Fabric workspace.
It supports optional parameters for guest tenant access and private link type. The function validates authentication, constructs the appropriate API endpoint,
and returns the connection string or handles errors as needed.

.PARAMETER WorkspaceId
The ID of the workspace containing the Warehouse. This parameter is mandatory.

.PARAMETER WarehouseId
The ID of the Warehouse for which to retrieve the connection string. This parameter is mandatory.

.PARAMETER GuestTenantId
(Optional) The tenant ID for guest access, if applicable.

.PARAMETER PrivateLinkType
(Optional) The type of private link to use for the connection string. Valid values are 'None' or 'Workspace'.

.EXAMPLE
Get-FabricWarehouseConnectionString -WorkspaceId "workspace123" -WarehouseId "warehouse456"

.EXAMPLE
Get-FabricWarehouseConnectionString -WorkspaceId "workspace123" -WarehouseId "warehouse456" -GuestTenantId "guestTenant789" -PrivateLinkType "Workspace"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
#>
function Get-FabricWarehouseConnectionString {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GuestTenantId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('None', 'Workspace')]
        [string]$PrivateLinkType
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}/connectionString" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseId
        # Append query parameters if GuestTenantId or PrivateLinkType are provided
        $queryParams = @()
        if ($GuestTenantId) {
            $queryParams += "guestTenantId=$GuestTenantId"
        }
        if ($PrivateLinkType) {
            $queryParams += "privateLinkType=$PrivateLinkType"
        }
        if ($queryParams.Count -gt 0) {
            $apiEndpointURI += "?" + ($queryParams -join "&")
        }

        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
           
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Warehouse connection string. Error: $errorDetails" -Level Error
    } 
}