<#
.SYNOPSIS
    Removes a GraphQL API from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a GraphQL API
    from the specified workspace using the provided WorkspaceId and GraphQLApiId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the GraphQL API.

.PARAMETER GraphQLApiId
    The unique identifier of the GraphQL API to be removed.

.EXAMPLE
    Remove-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiId "graphqlapi-67890"
    Removes the GraphQL API with ID "graphqlapi-67890" from the workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricGraphQLApi {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $GraphQLApiId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "GraphQLApi '$GraphQLApiId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
       
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete GraphQLApi '$GraphQLApiId'. Error: $errorDetails" -Level Error
    }
}