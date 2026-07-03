<#
.SYNOPSIS
    Updates a restore point for a Microsoft Fabric warehouse.

.DESCRIPTION
    The Update-FabricWarehouseRestorePoint function sends a PATCH request to the
    /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId}
    endpoint to update the display name and/or description of an existing restore point.

    Only the supplied fields are included in the request body. The updated restore point
    object is returned. By default it is enriched with the originating WorkspaceId, a
    resolved WorkspaceName, and decorated for the custom table view; pass -Raw to return
    the untouched API response.

.PARAMETER WorkspaceId
    (Mandatory) The unique identifier of the workspace containing the warehouse.

.PARAMETER WarehouseId
    (Mandatory) The unique identifier of the warehouse containing the restore point.

.PARAMETER RestorePointId
    (Mandatory) The unique identifier of the restore point to update.

.PARAMETER DisplayName
    (Optional) The new restore point name. Maximum length is 128 characters.

.PARAMETER Description
    (Optional) The new restore point description. Maximum length is 512 characters.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Update-FabricWarehouseRestorePoint -WorkspaceId "12345" -WarehouseId "67890" -RestorePointId "rp-1" -DisplayName "Renamed"

    Updates the display name of the restore point.

.OUTPUTS
    System.Object
    The updated restore point object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoint: PATCH /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints/{restorePointId}
    - Requires `$FabricAuthContext` global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricWarehouseRestorePoint {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$RestorePointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DisplayName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('workspaces', $WorkspaceId, 'warehouses', $WarehouseId, 'restorePoints', $RestorePointId)
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body with only the supplied fields per UpdateRestorePointRequest.
            $body = @{}
            if ($DisplayName) { $body.displayName = $DisplayName }
            if ($Description) { $body.description = $Description }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }

            $target = "Restore point '$RestorePointId' on warehouse '$WarehouseId'"
            if ($PSCmdlet.ShouldProcess($target, "Update Warehouse restore point")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after updating restore point '$RestorePointId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                # Resolve the workspace display name for enrichment.
                $workspaceName = $WorkspaceId
                try {
                    $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
                }
                catch {
                    Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
                }

                $response | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $response | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.WarehouseRestorePoint'
                Write-FabricLog -Message "Restore point '$RestorePointId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Warehouse Restore Point. Error: $errorDetails" -Level Error
        }
    }
}
