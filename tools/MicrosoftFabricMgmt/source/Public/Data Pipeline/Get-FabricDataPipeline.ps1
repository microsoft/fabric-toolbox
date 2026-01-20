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

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
     Get-FabricData Pipeline -WorkspaceId "workspace-12345" -Data PipelineId "Data Pipeline-67890"
    This example retrieves the Data Pipeline details for the Data Pipeline with ID "Data Pipeline-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricData Pipeline -WorkspaceId "workspace-12345" -Data PipelineName "My Data Pipeline"
    This example retrieves the Data Pipeline details for the Data Pipeline named "My Data Pipeline" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricDataPipeline -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all data pipelines in the workspace without any formatting or type decoration.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricDataPipeline {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataPipelineName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataPipelines'

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $DataPipelineId -DisplayName $DataPipelineName -ResourceType 'Data Pipeline' -TypeName 'MicrosoftFabric.DataPipeline' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve DataPipeline for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
