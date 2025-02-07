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
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentId
    )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/mlExperiments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MLExperimentId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Delete `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -StatusCodeVariable "statusCode"

        # Step 4: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }
        Write-Message -Message "ML Experiment '$MLExperimentId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        
    }
    catch {
        # Step 5: Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete ML Experiment '$MLExperimentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
