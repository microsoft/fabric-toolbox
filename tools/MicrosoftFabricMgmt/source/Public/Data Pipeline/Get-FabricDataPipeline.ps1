<#
.SYNOPSIS
    Retrieves data pipelines from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves all data pipelines from a specified workspace using either the provided Data PipelineId or Data PipelineName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Data Pipeline exists. This parameter is mandatory.

.PARAMETER DataPipelineId
    The unique identifier of the Data Pipeline to retrieve. This parameter is optional and filters the results to a single pipeline when provided.

.PARAMETER DataPipelineName
    The display name of the Data Pipeline to retrieve. This parameter is optional and filters the results by name.

.EXAMPLE
     Get-FabricData Pipeline -WorkspaceId "workspace-12345" -Data PipelineId "Data Pipeline-67890"
    This example retrieves the Data Pipeline details for the Data Pipeline with ID "Data Pipeline-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricData Pipeline -WorkspaceId "workspace-12345" -Data PipelineName "My Data Pipeline"
    This example retrieves the Data Pipeline details for the Data Pipeline named "My Data Pipeline" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricDataPipeline {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataPipelineName
    )
    try {
        # Validate input parameters
        if ($DataPipelineId -and $DataPipelineName) {
            Write-FabricLog -Message "Specify only one parameter: either 'DataPipelineId' or 'DataPipelineName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/dataPipelines" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($DataPipelineId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $DataPipelineId }, 'First')
        }
        elseif ($DataPipelineName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $DataPipelineName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve DataPipeline. Error: $errorDetails" -Level Error
    }
}
