<#
.SYNOPSIS
    Removes a DataPipeline from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a DataPipeline
    from the specified workspace using the provided WorkspaceId and DataPipelineId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the DataPipeline will be removed.

.PARAMETER DataPipelineId
    The unique identifier of the DataPipeline to be removed.

.EXAMPLE
     Remove-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "pipeline-67890"
    This example removes the DataPipeline with ID "pipeline-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>

function Remove-FabricDataPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineId
    )
    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'dataPipelines', $DataPipelineId)
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("DataPipeline '$DataPipelineId' in workspace '$WorkspaceId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "DataPipeline '$DataPipelineId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete DataPipeline '$DataPipelineId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
