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

.PARAMETER Raw
Optional. When specified, returns the raw API response with resolved CapacityName and WorkspaceName properties
added directly to the output objects. Useful for piping to Export-Csv, ConvertTo-Json, or other commands.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -LakehouseId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the single Lakehouse with the specified Id.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -LakehouseName "Development"

Retrieves the Lakehouse named Development from workspace 12345.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345"

Lists all Lakehouses available in the workspace.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -Raw | Export-Csv -Path "lakehouses.csv"

Exports all Lakehouses with resolved names to a CSV file.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricLakehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$LakehouseName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($LakehouseId -and $LakehouseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'LakehouseId' or 'LakehouseName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/lakehouses" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $LakehouseId -DisplayName $LakehouseName -ResourceType 'Lakehouse' -TypeName 'MicrosoftFabric.Lakehouse' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Lakehouse for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
