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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GraphQLApiId
    )
    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQLApis' -ItemId $GraphQLApiId

        if ($PSCmdlet.ShouldProcess($GraphQLApiId, "Delete GraphQL API in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "GraphQLApi '$GraphQLApiId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete GraphQLApi '$GraphQLApiId'. Error: $errorDetails" -Level Error
        }
    }
}
