<#
.SYNOPSIS
    Creates a new ML Experiment in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new ML Experiment 
    in the specified workspace. It supports optional parameters for ML Experiment description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Experiment will be created. This parameter is mandatory.

.PARAMETER MLExperimentName
    The name of the ML Experiment to be created. This parameter is mandatory.

.PARAMETER MLExperimentDescription
    An optional description for the ML Experiment.

.EXAMPLE
     New-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentName "New ML Experiment" -MLExperimentDescription "Description of the new ML Experiment"
    This example creates a new ML Experiment named "New ML Experiment" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function New-FabricMLExperiment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$MLExperimentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/mlExperiments" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MLExperimentName
        }

        if ($MLExperimentDescription) {
            $body.description = $MLExperimentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response   
        Write-Message -Message "ML Experiment '$MLExperimentName' created successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create ML Experiment. Error: $errorDetails" -Level Error
    }
}
