<#
.SYNOPSIS
Gets table metadata for a Lakehouse.

.DESCRIPTION
The Get-FabricLakehouseTable cmdlet retrieves table metadata for a specified Lakehouse within a workspace. Use this to
inspect available tables or validate that ingestion has produced expected table objects.

.PARAMETER WorkspaceId
The GUID of the workspace hosting the Lakehouse. Required so the API can locate the Lakehouse resource scope.

.PARAMETER LakehouseId
The Id of the Lakehouse whose tables you want to enumerate. Required for the request URL. Provide the Lakehouse Id
returned from a prior Get-FabricLakehouse call.

.EXAMPLE
Get-FabricLakehouseTable -WorkspaceId 11111111-2222-3333-4444-555555555555 -LakehouseId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Returns one or more table metadata objects for the specified Lakehouse.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricLakehouseTable {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Initialize variables
        $maxResults = 1

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/tables?maxResults={3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId, $maxResults
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        if ($dataItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
        else {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Lakehouse. Error: $errorDetails" -Level Error
    }

}
