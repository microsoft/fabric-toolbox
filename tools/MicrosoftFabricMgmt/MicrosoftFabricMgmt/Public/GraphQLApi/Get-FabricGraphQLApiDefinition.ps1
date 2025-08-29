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
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic     
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $GraphQLApiId
        if ($GraphQLApiFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $GraphQLApiFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
    
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "GraphQLApi '$GraphQLApiId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve GraphQLApi. Error: $errorDetails" -Level Error
    } 
 }