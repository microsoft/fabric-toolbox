<#
.SYNOPSIS
    Creates a new GraphQL API resource in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to provision a new GraphQL API in the given workspace.
    Supports optional parameters for description, definition file, and platform-specific definition file.

.PARAMETER WorkspaceId
    The ID of the workspace where the GraphQL API will be created. Required.

.PARAMETER GraphQLApiName
    The display name for the new GraphQL API. Required.

.PARAMETER GraphQLApiDescription
    Optional. A description for the GraphQL API.

.PARAMETER GraphQLApiPathDefinition
    Optional. Path to the GraphQL API definition file to include.

.PARAMETER GraphQLApiPathPlatformDefinition
    Optional. Path to the platform-specific definition file to include.

.PARAMETER FolderId
    Optional. The folder ID where the GraphQL API will be placed.

.EXAMPLE
    New-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiName "MyApi" -GraphQLApiDescription "Sample API"
    Creates a new GraphQL API named "MyApi" in the specified workspace with a description.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function New-FabricGraphQLApi {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQLApiName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $GraphQLApiName
        }

        if ($FolderId) {
            $body.folderId = $FolderId
        }

        if ($GraphQLApiDescription) {
            $body.description = $GraphQLApiDescription
        }
        if ($GraphQLApiPathDefinition) {
            $GraphQLApiEncodedContent = Convert-ToBase64 -filePath $GraphQLApiPathDefinition

            if (-not [string]::IsNullOrEmpty($GraphQLApiEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "GraphQLApiV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "graphql-definition.json"
                    payload     = $GraphQLApiEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in GraphQLApi definition." -Level Error
                return $null
            }
        }

        if ($GraphQLApiPathPlatformDefinition) {
            $GraphQLApiEncodedPlatformContent = Convert-ToBase64 -filePath $GraphQLApiPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($GraphQLApiEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "GraphQLApiV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $GraphQLApiEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "GraphQLApi '$GraphQLApiName' created successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create GraphQLApi. Error: $errorDetails" -Level Error
    }
}