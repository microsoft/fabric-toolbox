<#
.SYNOPSIS
    Updates an existing warehouse snapshot in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update a warehouse snapshot's name, description, or snapshot date/time within a specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the warehouse snapshot.

.PARAMETER WarehouseSnapshotId
    The unique identifier of the warehouse snapshot to update.

.PARAMETER WarehouseSnapshotName
    The new display name for the warehouse snapshot.

.PARAMETER WarehouseSnapshotDescription
    (Optional) A new description for the warehouse snapshot.

.PARAMETER SnapshotDateTime
    (Optional) The snapshot date/time in ISO 8601 format (yyyy-MM-ddTHH:mm:ssZ).

.EXAMPLE
    Update-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotId "snapshot-67890" -WarehouseSnapshotName "Q1 Snapshot" -WarehouseSnapshotDescription "Quarter 1 data" -SnapshotDateTime "2024-06-01T00:00:00Z"

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure authentication token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricWarehouseSnapshot {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseSnapshotName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')]
        [string]$SnapshotDateTime
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseSnapshotName
        }

        if ($WarehouseSnapshotDescription) {
            $body.description = $WarehouseSnapshotDescription
        }

        if ($SnapshotDateTime) {
            if (-not $body.ContainsKey('properties')) {
                $body.properties = @{}
            }
            $body.properties.snapshotDateTime = $SnapshotDateTime
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug
        
        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Patch'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        # Return the API response
        Write-Message -Message "Warehouse Snapshot '$WarehouseSnapshotName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Warehouse Snapshot '$WarehouseSnapshotName'. Error: $errorDetails" -Level Error
    }
}
