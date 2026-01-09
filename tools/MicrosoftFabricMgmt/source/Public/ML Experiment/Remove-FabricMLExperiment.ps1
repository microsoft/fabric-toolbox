<#
.SYNOPSIS
    Removes an ML Experiment from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an ML Experiment
    from the specified workspace using the provided WorkspaceId and MLExperimentId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the MLExperiment will be removed.

.PARAMETER MLExperimentId
    The unique identifier of the MLExperiment to be removed.

.EXAMPLE
     Remove-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentId "experiment-67890"
    This example removes the MLExperiment with ID "experiment-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricMLExperiment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentId
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlExperiments/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $MLExperimentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "ML Experiment '$MLExperimentId' in workspace '$WorkspaceId'"
        $action = "Delete ML Experiment"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Experiment '$MLExperimentId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete ML Experiment '$MLExperimentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
