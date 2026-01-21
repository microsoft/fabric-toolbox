<#
.SYNOPSIS
    Updates an existing Dataflow in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update a Dataflow's
    display name and/or description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Dataflow.

.PARAMETER DataflowId
    The unique identifier of the Dataflow to update.

.PARAMETER DataflowName
    Optional. The new display name for the Dataflow.

.PARAMETER DataflowDescription
    Optional. The new description for the Dataflow.

.EXAMPLE
    Update-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -DataflowName "UpdatedName"

    Updates the Dataflow's display name.

.EXAMPLE
    Update-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -DataflowDescription "New description"

    Updates the Dataflow's description.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricDataflow {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataflowId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataflowName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataflowDescription
    )

    try {
        # Validate at least one update parameter is provided
        if (-not $DataflowName -and -not $DataflowDescription) {
            Write-FabricLog -Message "At least one of 'DataflowName' or 'DataflowDescription' must be provided." -Level Error
            return
        }

        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows' -ItemId $DataflowId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($DataflowName) {
            $body.displayName = $DataflowName
        }

        if ($DataflowDescription) {
            $body.description = $DataflowDescription
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Patch'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess($DataflowId, "Update Dataflow in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Dataflow '$DataflowId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Dataflow. Error: $errorDetails" -Level Error
    }
}
