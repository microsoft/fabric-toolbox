<#
.SYNOPSIS
    Updates an existing DataPipeline in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing DataPipeline
    in the specified workspace. It supports optional parameters for DataPipeline description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the DataPipeline exists. This parameter is optional.

.PARAMETER DataPipelineId
    The unique identifier of the DataPipeline to be updated. This parameter is mandatory.

.PARAMETER DataPipelineName
    The new name of the DataPipeline. This parameter is mandatory.

.PARAMETER DataPipelineDescription
    An optional new description for the DataPipeline.

.EXAMPLE
     Update-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "pipeline-67890" -DataPipelineName "Updated DataPipeline" -DataPipelineDescription "Updated description"
    This example updates the DataPipeline with ID "pipeline-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricDataPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataPipelineName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineDescription
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'dataPipelines', $DataPipelineId)
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DataPipelineName
        }

        if ($DataPipelineDescription) {
            $body.description = $DataPipelineDescription
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("DataPipeline '$DataPipelineId' in workspace '$WorkspaceId'", "Update properties")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Data Pipeline '$DataPipelineName' updated successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update DataPipeline. Error: $errorDetails" -Level Error
    }
}
