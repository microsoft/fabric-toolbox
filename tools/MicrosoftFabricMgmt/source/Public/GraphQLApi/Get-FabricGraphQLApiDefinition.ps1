<#
.SYNOPSIS
    Retrieves the definition of a GraphQL API from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Fetches the definition of a GraphQL API in a given workspace using its ID. Handles authentication, constructs the API endpoint, and returns the API response.

.PARAMETER WorkspaceId
    The ID of the workspace containing the GraphQL API. Mandatory.

.PARAMETER GraphQLApiId
    The ID of the GraphQL API to retrieve. Optional.

.PARAMETER GraphQLApiFormat
    The desired format for the API definition (e.g., 'json'). Optional.

.EXAMPLE
    Get-FabricGraphQLApiDefinition -WorkspaceId "workspace-12345" -GraphQLApiId "GraphQLApi-67890"
    Retrieves the definition for the specified GraphQL API in the given workspace.

.EXAMPLE
    Get-FabricGraphQLApiDefinition -WorkspaceId "workspace-12345" -GraphQLApiId "GraphQLApi-67890" -GraphQLApiFormat "json"
    Retrieves the GraphQL API definition in JSON format.

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Uses `Test-TokenExpired` to validate authentication before the request.

    Author: Tiago Balabuch
#>
function Get-FabricGraphQLApiDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiFormat
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI with optional format parameter
        $queryParams = if ($GraphQLApiFormat) {
            @{ format = $GraphQLApiFormat }
        } else {
            $null
        }

        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQLApis' -ItemId $GraphQLApiId -QueryParameters $queryParams
        $apiEndpointURI = $apiEndpointURI -replace '/GraphQLApis/([^/]+)$', '/GraphQLApis/$1/getDefinition'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "GraphQLApi '$GraphQLApiId' definition retrieved successfully!" -Level Debug
        $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve GraphQLApi. Error: $errorDetails" -Level Error
    }
 }
