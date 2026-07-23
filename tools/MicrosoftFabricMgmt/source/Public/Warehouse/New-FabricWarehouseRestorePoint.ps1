<#
.SYNOPSIS
    Creates a restore point for a Microsoft Fabric warehouse.

.DESCRIPTION
    The New-FabricWarehouseRestorePoint function sends a POST request to the
    /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints endpoint to create a
    user-defined restore point for a warehouse.

    The created restore point object is returned. By default it is enriched with the
    originating WorkspaceId, a resolved WorkspaceName, and decorated for the custom table
    view; pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    (Mandatory) The unique identifier of the workspace containing the warehouse.

.PARAMETER WarehouseId
    (Mandatory) The unique identifier of the warehouse to create the restore point for.

.PARAMETER DisplayName
    (Optional) The restore point name. Maximum length is 128 characters.

.PARAMETER Description
    (Optional) The restore point description. Maximum length is 512 characters.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    New-FabricWarehouseRestorePoint -WorkspaceId "12345" -WarehouseId "67890" -DisplayName "Before upgrade"

    Creates a restore point named "Before upgrade" for the warehouse.

.OUTPUTS
    System.Object
    The created restore point object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/warehouses/{warehouseId}/restorePoints
    - Requires `$FabricAuthContext` global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function New-FabricWarehouseRestorePoint {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WarehouseId,

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

            $segments = @('workspaces', $WorkspaceId, 'warehouses', $WarehouseId, 'restorePoints')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body per the CreateRestorePointRequest schema.
            $body = @{}
            if ($DisplayName) { $body.displayName = $DisplayName }
            if ($Description) { $body.description = $Description }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            $target = "Warehouse '$WarehouseId' in workspace '$WorkspaceId'"
            if ($PSCmdlet.ShouldProcess($target, "Create Warehouse restore point")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after creating restore point for warehouse '$WarehouseId'." -Level Warning
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
                Write-FabricLog -Message "Restore point created successfully for warehouse '$WarehouseId'!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create Warehouse Restore Point. Error: $errorDetails" -Level Error
        }
    }
}
