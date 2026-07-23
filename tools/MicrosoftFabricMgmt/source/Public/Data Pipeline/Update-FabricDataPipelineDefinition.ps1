<#
.SYNOPSIS
Updates the public definition of a data pipeline in a Microsoft Fabric workspace.

.DESCRIPTION
The Update-FabricDataPipelineDefinition function sends a POST request to the
/workspaces/{workspaceId}/dataPipelines/{dataPipelineId}/updateDefinition endpoint to
override the definition of an existing data pipeline. The definition is supplied as a
hashtable (containing the definition parts) so any pipeline definition shape can be
expressed. Optionally the item metadata can be updated from a supplied .platform part.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace containing the data pipeline.

.PARAMETER DataPipelineId
(Mandatory) The unique identifier of the data pipeline to update.

.PARAMETER Definition
(Mandatory) A hashtable describing the data pipeline definition, e.g.
@{ parts = @(@{ path = 'pipeline-content.json'; payload = '<base64>'; payloadType = 'InlineBase64' }) }

.PARAMETER UpdateMetadata
(Optional) When specified, appends ?updateMetadata=true so the item's metadata is
updated using the metadata in the supplied .platform file.

.PARAMETER Raw
If specified, returns the untouched API response.

.EXAMPLE
$definition = @{ parts = @(@{ path = 'pipeline-content.json'; payload = $encoded; payloadType = 'InlineBase64' }) }
Update-FabricDataPipelineDefinition -WorkspaceId "12345" -DataPipelineId "67890" -Definition $definition

Overrides the definition of the data pipeline with ID 67890 in workspace 12345.

.EXAMPLE
Update-FabricDataPipelineDefinition -WorkspaceId "12345" -DataPipelineId "67890" -Definition $definition -UpdateMetadata

Overrides the definition and updates item metadata from the supplied .platform part.

.OUTPUTS
System.Object
The API response from the update definition operation.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/dataPipelines/{dataPipelineId}/updateDefinition
- Requires `$FabricAuthContext` global configuration, including BaseUrl and FabricHeaders.
- Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricDataPipelineDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataPipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition,

        [Parameter(Mandatory = $false)]
        [switch]$UpdateMetadata,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI, appending updateMetadata when requested.
            $segments = @('workspaces', $WorkspaceId, 'dataPipelines', $DataPipelineId, 'updateDefinition')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            if ($UpdateMetadata) {
                $apiEndpointURI = "{0}?updateMetadata=true" -f $apiEndpointURI
            }
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body. The supplied definition hashtable is passed
            # through verbatim so any pipeline definition shape can be expressed.
            $body = @{
                definition = $Definition
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            $target = "Data pipeline '$DataPipelineId' in workspace '$WorkspaceId'"
            $action = "Update Data Pipeline definition"
            if ($PSCmdlet.ShouldProcess($target, $action)) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Data pipeline definition '$DataPipelineId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Data Pipeline definition. Error: $errorDetails" -Level Error
        }
    }
}
