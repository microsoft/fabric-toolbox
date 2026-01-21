<#
.SYNOPSIS
    Gets the queryable graph type for a Graph Model.

.DESCRIPTION
    The Get-FabricGraphModelQueryableType cmdlet retrieves the current queryable graph type
    for the specified Graph Model. This is a beta API that requires the beta parameter.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model.

.PARAMETER GraphModelId
    The GUID of the Graph Model to get the queryable type for.

.EXAMPLE
    Get-FabricGraphModelQueryableType -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Gets the queryable graph type for the specified Graph Model.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This is a beta API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricGraphModelQueryableType {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GraphModelId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI with beta query parameter
            $uriParams = @{
                Resource        = 'workspaces'
                WorkspaceId     = $WorkspaceId
                Subresource     = 'GraphModels'
                ItemId          = "$GraphModelId/getQueryableGraphType"
                QueryParameters = @{ beta = 'true' }
            }
            $apiEndpointURI = New-FabricAPIUri @uriParams
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($response) {
                Write-FabricLog -Message "Queryable graph type retrieved successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to get queryable graph type for Graph Model '$GraphModelId'. Error: $errorDetails" -Level Error
        }
    }
}
