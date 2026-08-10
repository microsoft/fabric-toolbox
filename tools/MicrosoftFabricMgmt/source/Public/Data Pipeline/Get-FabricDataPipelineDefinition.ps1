<#
.SYNOPSIS
Retrieves the public definition of a data pipeline from a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricDataPipelineDefinition function sends a POST request to the
/workspaces/{workspaceId}/dataPipelines/{dataPipelineId}/getDefinition endpoint to
retrieve the public definition (parts) of a data pipeline. The definition parts are
returned unchanged so callers can inspect or persist the pipeline content.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace containing the data pipeline.

.PARAMETER DataPipelineId
(Mandatory) The unique identifier of the data pipeline whose definition is retrieved.

.PARAMETER Format
(Optional) The format of the data pipeline public definition. When supplied it is
appended as the ?format= query parameter.

.PARAMETER Raw
If specified, returns the untouched API response.

.EXAMPLE
Get-FabricDataPipelineDefinition -WorkspaceId "12345" -DataPipelineId "67890"

Retrieves the definition of the data pipeline with ID 67890 from workspace 12345.

.EXAMPLE
Get-FabricDataPipelineDefinition -WorkspaceId "12345" -DataPipelineId "67890" -Raw

Retrieves the untouched API response for the data pipeline definition.

.OUTPUTS
System.Object
The data pipeline definition object, including its definition parts.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/dataPipelines/{dataPipelineId}/getDefinition
- Requires `$FabricAuthContext` global configuration, including BaseUrl and FabricHeaders.
- Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricDataPipelineDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataPipelineId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Format,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI, appending the format query parameter when supplied.
            $segments = @('workspaces', $WorkspaceId, 'dataPipelines', $DataPipelineId, 'getDefinition')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            if ($Format) {
                $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $Format
            }
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($Raw) {
                return $response
            }

            Write-FabricLog -Message "Data pipeline '$DataPipelineId' definition retrieved successfully!" -Level Debug
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Data Pipeline definition. Error: $errorDetails" -Level Error
        }
    }
}
