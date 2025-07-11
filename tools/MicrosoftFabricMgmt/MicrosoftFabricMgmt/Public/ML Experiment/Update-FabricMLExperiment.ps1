<#
.SYNOPSIS
    Updates an existing ML Experiment in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing ML Experiment 
    in the specified workspace. It supports optional parameters for ML Experiment description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Experiment exists. This parameter is optional.

.PARAMETER MLExperimentId
    The unique identifier of the ML Experiment to be updated. This parameter is mandatory.

.PARAMETER MLExperimentName
    The new name of the ML Experiment. This parameter is mandatory.

.PARAMETER MLExperimentDescription
    An optional new description for the ML Experiment.

.EXAMPLE
     Update-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentId "experiment-67890" -MLExperimentName "Updated ML Experiment" -MLExperimentDescription "Updated description"
    This example updates the ML Experiment with ID "experiment-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricMLExperiment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$MLExperimentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentDescription
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/mlExperiments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MLExperimentId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $MLExperimentName
        }

        if ($MLExperimentDescription) {
            $body.description = $MLExperimentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Patch `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -StatusCodeVariable "statusCode"

        # Step 5: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }

        # Step 6: Handle results
        Write-Message -Message "ML Experiment '$MLExperimentName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Step 7: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update ML Experiment. Error: $errorDetails" -Level Error
    }
}
