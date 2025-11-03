<#
.SYNOPSIS
Retrieves one or more Livy sessions for a specified Lakehouse in Microsoft Fabric.

.DESCRIPTION
The Get-FabricLakehouseLivySession function queries the Fabric API to obtain Livy session details for a given workspace and Lakehouse. Optionally, it can filter results by a specific Livy session ID.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Lakehouse.

.PARAMETER LakehouseId
(Mandatory) The ID of the Lakehouse for which to retrieve Livy sessions.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricLakehouseLivySession -WorkspaceId "12345" -LakehouseId "67890"

Retrieves all Livy sessions for the specified Lakehouse.

.EXAMPLE
Get-FabricLakehouseLivySession -WorkspaceId "12345" -LakehouseId "67890" -LivyId "abcde"

Retrieves the Livy session with ID "abcde" for the specified Lakehouse.

.NOTES
- Requires the global $FabricConfig object with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricLakehouseLivySession {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId
    )
    try {   
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/livySessions" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId
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

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Lakehouse Livy Session. Error: $errorDetails" -Level Error
    }
}