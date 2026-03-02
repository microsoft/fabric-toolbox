<#
.SYNOPSIS
    Retrieves ML Experiment details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves ML Experiment details from a specified workspace using either the provided MLExperimentId or MLExperimentName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Experiment exists. This parameter is mandatory.

.PARAMETER MLExperimentId
    The unique identifier of the ML Experiment to retrieve. This parameter is optional.

.PARAMETER MLExperimentName
    The name of the ML Experiment to retrieve. This parameter is optional.

.PARAMETER Raw
    When specified, returns the raw API response without any filtering or formatting.

.EXAMPLE
    Get-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentId "experiment-67890"
    This example retrieves the ML Experiment details for the experiment with ID "experiment-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentName "My ML Experiment"
    This example retrieves the ML Experiment details for the experiment named "My ML Experiment" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricMLExperiment -WorkspaceId "workspace-12345" -Raw
    This example returns the raw API response for all ML experiments in the workspace without any processing.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricMLExperiment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MLExperimentName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($MLExperimentId -and $MLExperimentName) {
                Write-FabricLog -Message "Specify only one parameter: either 'MLExperimentId' or 'MLExperimentName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/mlExperiments" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $MLExperimentId -DisplayName $MLExperimentName -ResourceType 'MLExperiment' -TypeName 'MicrosoftFabric.MLExperiment' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve ML Experiment for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
