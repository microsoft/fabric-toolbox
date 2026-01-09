<#
.SYNOPSIS
    Updates the definition of a GraphQLApi in a Microsoft Fabric workspace.

.DESCRIPTION
    Updates an existing GraphQLApi's definition by sending a request to the Microsoft Fabric API.
    Supports updating both the main definition and an optional platform-specific definition file.

.PARAMETER WorkspaceId
    The ID of the workspace containing the GraphQLApi.

.PARAMETER GraphQLApiId
    The ID of the GraphQLApi to update.

.PARAMETER GraphQLApiPathDefinition
    Path to the GraphQLApi definition file (required).

.PARAMETER GraphQLApiPathPlatformDefinition
    Path to an optional platform-specific definition file.

.EXAMPLE
    Update-FabricGraphQLApiDefinition -WorkspaceId "workspace-12345" -GraphQLApiId "GraphQLApi-67890" -GraphQLApiPathDefinition "C:\Path\To\GraphQLApiDefinition.json"

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before proceeding.
    Author: Tiago Balabuch
#>
function Update-FabricGraphQLApiDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathPlatformDefinition
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI with optional updateMetadata query parameter
        $queryParams = if ($GraphQLApiPathPlatformDefinition) {
            @{ updateMetadata = 'true' }
        } else {
            $null
        }

        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQLApis' -ItemId $GraphQLApiId -QueryParameters $queryParams
        $apiEndpointURI = $apiEndpointURI -replace '/GraphQLApis/([^/?]+)', '/GraphQLApis/$1/updateDefinition'

        # Construct the request body
        $body = @{
            definition = @{
                format = "GraphQLApiV1"
                parts  = @()
            }
        }

        if ($GraphQLApiPathDefinition) {
            $GraphQLApiEncodedContent = Convert-ToBase64 -filePath $GraphQLApiPathDefinition

            if (-not [string]::IsNullOrEmpty($GraphQLApiEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "GraphQLApiProperties.json"
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

        if ($PSCmdlet.ShouldProcess($GraphQLApiId, "Update GraphQL API definition in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for GraphQLApi with ID '$GraphQLApiId' in workspace '$WorkspaceId'." -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update GraphQLApi. Error: $errorDetails" -Level Error
    }
}
