<#
.SYNOPSIS
    Removes an ML Model from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an ML Model
    from the specified workspace using the provided WorkspaceId and MLModelId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the ML Model will be removed.

.PARAMETER MLModelId
    The unique identifier of the ML Model to be removed.

.EXAMPLE
     Remove-FabricMLModel -WorkspaceId "workspace-12345" -MLModelId "model-67890"
    This example removes the ML Model with ID "model-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricMLModel {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$MLModelId
    )
    process {
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlModels/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $MLModelId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "ML Model '$MLModelId' in workspace '$WorkspaceId'"
        $action = "Delete ML Model"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Model '$MLModelId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete ML Model '$MLModelId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
    }
}
