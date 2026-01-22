<#
.SYNOPSIS
    Retrieves GraphQL API details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets information about GraphQL APIs in a given workspace. You can filter the results by specifying either the GraphQLApiId or the GraphQLApiName.
    The function validates authentication, constructs the API endpoint, sends the request, and returns the matching API details.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the GraphQL API. This parameter is required.

.PARAMETER GraphQLApiId
    The unique identifier of the GraphQL API to retrieve. Optional.

.PARAMETER GraphQLApiName
    The display name of the GraphQL API to retrieve. Optional.

.EXAMPLE
    Get-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiId "graphqlapi-67890"
    Retrieves the GraphQL API with ID "graphqlapi-67890" from the specified workspace.

.EXAMPLE
    Get-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiName "My GraphQL API"
    Retrieves the GraphQL API named "My GraphQL API" from the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricGraphQLApi {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQLApiName
    )

    process {
        try {
            # Validate input parameters
            if ($GraphQLApiId -and $GraphQLApiName) {
                Write-FabricLog -Message "Specify only one parameter: either 'GraphQLApiId' or 'GraphQLApiName'." -Level Error
                return
            }

            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQLApis'

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and return results
            Select-FabricResource -InputObject $dataItems -Id $GraphQLApiId -DisplayName $GraphQLApiName -ResourceType 'GraphQL API' -TypeName 'MicrosoftFabric.GraphQLApi'
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve GraphQL API for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
