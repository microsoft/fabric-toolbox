<#
.SYNOPSIS
    Creates a new warehouse snapshot in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new warehouse snapshot in the given workspace.
    Supports optional parameters for description, parent warehouse, snapshot date/time, and folder.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse snapshot will be created. Mandatory.

.PARAMETER WarehouseSnapshotName
    The name of the warehouse snapshot to create. Mandatory.

.PARAMETER WarehouseSnapshotDescription
    Optional description for the warehouse snapshot.

.PARAMETER ParentWarehouseId
    Optional ID of the parent warehouse for the snapshot.

.PARAMETER SnapshotDateTime
    Optional snapshot date/time in UTC (format: yyyy-MM-ddTHH:mm:ssZ).

.PARAMETER FolderId
    Optional folder ID to organize the snapshot.

.EXAMPLE
    New-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotName "Snapshot1" -WarehouseSnapshotDescription "Nightly snapshot"
    Creates a warehouse snapshot named "Snapshot1" in the specified workspace with a description.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricWarehouseSnapshot {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$WarehouseSnapshotName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentWarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')]
        [string]$SnapshotDateTime,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId

    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehousesnapshots" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseSnapshotName
        }

        if ($WarehouseSnapshotDescription) {
            $body.description = $WarehouseSnapshotDescription
        }
        if ($FolderId) {
            $body.folderId = $FolderId
        }

        # Combine ParentWarehouseId and SnapshotDateTime into creationPayload if present
        if ($ParentWarehouseId -or $SnapshotDateTime) {
            $creationPayload = @{}
            if ($ParentWarehouseId) {
            $creationPayload.parentWarehouseId = $ParentWarehouseId
            }
            if ($SnapshotDateTime) {
            $creationPayload.snapshotDateTime = $SnapshotDateTime
            }
            $body.creationPayload = $creationPayload
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Warehouse Snapshot '$WarehouseSnapshotName' in workspace '$WorkspaceId'", 'Create')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Data Warehouse Snapshot created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Warehouse Snapshot. Error: $errorDetails" -Level Error
    }
}
