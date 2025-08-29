<#
.SYNOPSIS
    Updates an existing GraphQL API in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update the specified GraphQL API's name and optionally its description within a workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the GraphQL API.

.PARAMETER GraphQLApiId
    The unique identifier of the GraphQL API to update.

.PARAMETER GraphQLApiName
    The new display name for the GraphQL API.

.PARAMETER GraphQLApiDescription
    An optional new description for the GraphQL API.

.EXAMPLE
    Update-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiId "graphqlapi-67890" -GraphQLApiName "Updated API" -GraphQLApiDescription "Updated description"
    Updates the GraphQL API with the specified ID in the given workspace with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricGraphQLApi {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQLApiName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $GraphQLApiId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $GraphQLApiName
        }

        if ($GraphQLApiDescription) {
            $body.description = $GraphQLApiDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Patch'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "GraphQL API '$GraphQLApiName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update GraphQL API. Error: $errorDetails" -Level Error
    }
}