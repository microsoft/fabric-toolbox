<#
.SYNOPSIS
    Executes a query on a Graph Model in a Fabric workspace.

.DESCRIPTION
    The Invoke-FabricGraphModelQuery cmdlet executes a GQL query on the specified Graph Model.
    This is a beta API that requires the beta parameter to be set to true.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model.

.PARAMETER GraphModelId
    The GUID of the Graph Model to query.

.PARAMETER Query
    The GQL query string to execute.

.EXAMPLE
    Invoke-FabricGraphModelQuery -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Query "MATCH (n) RETURN n LIMIT 10"

    Executes a GQL query on the specified Graph Model.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This is a beta API.
    - Results are returned in JSON format. Refer to the MSFT GQL API documentation for result format.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Invoke-FabricGraphModelQuery {
    [CmdletBinding()]
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
        [string]$Query
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI with beta query parameter
            $uriParams = @{
                Resource        = 'workspaces'
                WorkspaceId     = $WorkspaceId
                Subresource     = 'GraphModels'
                ItemId          = "$GraphModelId/executeQuery"
                QueryParameters = @{ beta = 'true' }
            }
            $apiEndpointURI = New-FabricAPIUri @uriParams
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{
                query = $Query
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($response) {
                Write-FabricLog -Message "Graph Model query executed successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to execute query on Graph Model '$GraphModelId'. Error: $errorDetails" -Level Error
        }
    }
}
