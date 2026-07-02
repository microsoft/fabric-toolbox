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

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

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
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId,

        [Parameter()]
        [switch]$Raw
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/livySessions" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $LakehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if (-not $matchedItems) {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }

        if ($Raw) {
            return $matchedItems
        }

        Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug

        # Enrich with resolved workspace and capacity names
        $workspaceName = $null
        try {
            $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
        }
        catch {
            $workspaceName = $WorkspaceId
            Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
        }

        $capacityName = $null
        try {
            $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $WorkspaceId
            if ($capacityId) {
                $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
            }
        }
        catch {
            Write-FabricLog -Message "Failed to resolve capacity name for workspace ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
        }

        foreach ($item in $matchedItems) {
            $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
            $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            if ($null -ne $capacityName) {
                $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
            }
        }

        $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.LivySession'
        return $matchedItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Lakehouse Livy Session. Error: $errorDetails" -Level Error
    }
}
