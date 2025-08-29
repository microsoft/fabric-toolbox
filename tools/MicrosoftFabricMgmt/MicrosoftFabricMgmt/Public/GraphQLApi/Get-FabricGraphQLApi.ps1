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
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQLApiName
    )
    try {
        # Validate input parameters
        if ($GraphQLApiId -and $GraphQLApiName) {
            Write-Message -Message "Specify only one parameter: either 'GraphQLApiId' or 'GraphQLApiName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
       
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
  
        # Apply filtering logic efficiently
        if ($GraphQLApiId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $GraphQLApiId }, 'First')
        }
        elseif ($GraphQLApiName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $GraphQLApiName }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }
  
        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve GraphQL API. Error: $errorDetails" -Level Error
    }
}