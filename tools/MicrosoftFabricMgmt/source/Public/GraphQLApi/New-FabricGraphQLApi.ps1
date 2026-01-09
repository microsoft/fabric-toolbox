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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQLApis'

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
                Write-FabricLog -Message "Invalid or empty content in GraphQLApi definition." -Level Error
                return
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
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        if ($PSCmdlet.ShouldProcess("GraphQL API '$GraphQLApiName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "GraphQLApi '$GraphQLApiName' created successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create GraphQLApi. Error: $errorDetails" -Level Error
    }
}
