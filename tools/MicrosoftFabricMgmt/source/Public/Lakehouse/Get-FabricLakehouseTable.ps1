<#
.SYNOPSIS
Retrieves one or more tables from a Lakehouse in a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches Lakehouse table metadata from a workspace.

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
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Initialize variables
        $maxResults = 1

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/tables?maxResults={3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId, $maxResults
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        if ($dataItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
        else {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Lakehouse. Error: $errorDetails" -Level Error
    }

}
