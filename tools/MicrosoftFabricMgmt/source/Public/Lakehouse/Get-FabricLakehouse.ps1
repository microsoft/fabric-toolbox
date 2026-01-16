<#
.SYNOPSIS
Gets a Lakehouse or lists all Lakehouses in a workspace.

.DESCRIPTION
The Get-FabricLakehouse cmdlet retrieves Lakehouse items from a specified Microsoft Fabric workspace. You can list all
Lakehouses or filter by a specific lakehouse Id or display name. Only one of LakehouseId or LakehouseName can be used.

.PARAMETER WorkspaceId
The GUID of the workspace containing the Lakehouse resources you wish to enumerate. This is required for every call.

.PARAMETER LakehouseId
Optional. Returns only the Lakehouse matching this resource Id. Use this when you previously captured the Id from a
listing and want a direct lookup without client filtering.

.PARAMETER LakehouseName
Optional. Returns only the Lakehouse whose display name exactly matches this value. Provide this when the Id is not
known. Do not combine with LakehouseId.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -LakehouseId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the single Lakehouse with the specified Id.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -LakehouseName "Development"

Retrieves the Lakehouse named Development from workspace 12345.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345"

Lists all Lakehouses available in the workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricLakehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$LakehouseName
    )
    try {
        # Validate input parameters
        if ($LakehouseId -and $LakehouseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'LakehouseId' or 'LakehouseName'." -Level Error
            return $null
        }

        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LakehouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $LakehouseId }, 'First')
        }
        elseif ($LakehouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $LakehouseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug

            # Add type decoration for custom formatting
            $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.Lakehouse'

            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Lakehouse. Error: $errorDetails" -Level Error
    }

}
