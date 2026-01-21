<#
.SYNOPSIS
    Updates the definition of a Graph Model in a Fabric workspace.

.DESCRIPTION
    The Update-FabricGraphModelDefinition cmdlet overrides the definition for the specified Graph Model.
    This API supports long running operations (LRO).

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model.

.PARAMETER GraphModelId
    The GUID of the Graph Model whose definition to update.

.PARAMETER Definition
    The definition object containing the parts array to update.

.PARAMETER UpdateMetadata
    Optional. When set to true and the .platform file is provided as part of the definition,
    the item's metadata is updated using the metadata in the .platform file.

.EXAMPLE
    $definition = @{
        parts = @(
            @{
                path = "model.json"
                payload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"model": "content"}'))
                payloadType = "InlineBase64"
            }
        )
    }
    Update-FabricGraphModelDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Definition $definition

    Updates the definition of the specified Graph Model.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).
    - Updating the definition does not affect its sensitivity label.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricGraphModelDefinition {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GraphModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition,

        [Parameter(Mandatory = $false)]
        [switch]$UpdateMetadata
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build query parameters
            $queryParams = @{}
            if ($UpdateMetadata) {
                $queryParams['updateMetadata'] = 'true'
            }

            # Construct the API endpoint URI
            $uriParams = @{
                Resource    = 'workspaces'
                WorkspaceId = $WorkspaceId
                Subresource = 'GraphModels'
                ItemId      = "$GraphModelId/updateDefinition"
            }
            if ($queryParams.Count -gt 0) {
                $uriParams['QueryParameters'] = $queryParams
            }
            $apiEndpointURI = New-FabricAPIUri @uriParams
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{
                definition = $Definition
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Graph Model definition '$GraphModelId'", "Update")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Graph Model definition updated successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Graph Model definition for '$GraphModelId'. Error: $errorDetails" -Level Error
        }
    }
}
