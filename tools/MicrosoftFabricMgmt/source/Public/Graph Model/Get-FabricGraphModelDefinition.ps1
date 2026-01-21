<#
.SYNOPSIS
    Gets the definition of a Graph Model from a Fabric workspace.

.DESCRIPTION
    The Get-FabricGraphModelDefinition cmdlet retrieves the public definition of a Graph Model
    from a specified workspace. This API supports long running operations (LRO).

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model.

.PARAMETER GraphModelId
    The GUID of the Graph Model whose definition to retrieve.

.PARAMETER Format
    Optional. The format of the Graph Model public definition.

.EXAMPLE
    Get-FabricGraphModelDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Retrieves the definition of the specified Graph Model.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).
    - The sensitivity label is not a part of the definition.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricGraphModelDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GraphModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Format
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build query parameters if format specified
            $queryParams = @{}
            if ($Format) {
                $queryParams['format'] = $Format
            }

            # Construct the API endpoint URI
            $uriParams = @{
                Resource    = 'workspaces'
                WorkspaceId = $WorkspaceId
                Subresource = 'GraphModels'
                ItemId      = "$GraphModelId/getDefinition"
            }
            if ($queryParams.Count -gt 0) {
                $uriParams['QueryParameters'] = $queryParams
            }
            $apiEndpointURI = New-FabricAPIUri @uriParams
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request (POST to getDefinition)
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($response) {
                Write-FabricLog -Message "Graph Model definition retrieved successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Graph Model definition for '$GraphModelId'. Error: $errorDetails" -Level Error
        }
    }
}
