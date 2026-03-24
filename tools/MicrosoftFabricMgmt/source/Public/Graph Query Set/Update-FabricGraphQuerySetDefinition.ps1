<#
.SYNOPSIS
    Updates the definition of a Graph Query Set item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Graph Query Set item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Graph Query Set item.

.PARAMETER GraphQuerySetId
    The unique identifier of the Graph Query Set item to update.

.PARAMETER GraphQuerySetPathDefinition
    File path to the Graph Query Set item definition JSON file to upload.

.PARAMETER GraphQuerySetPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricGraphQuerySetDefinition -WorkspaceId "workspace-12345" -GraphQuerySetId "-67890" -GraphQuerySetPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricGraphQuerySetDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQuerySetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQuerySetPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQuerySetPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'GraphQuerySets', $GraphQuerySetId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($GraphQuerySetPathDefinition) {
            $GraphQuerySetEncodedContent = Convert-ToBase64 -filePath $GraphQuerySetPathDefinition

            if (-not [string]::IsNullOrEmpty($GraphQuerySetEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $GraphQuerySetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Graph Query Set definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($GraphQuerySetPathPlatformDefinition) {
            $GraphQuerySetEncodedPlatformContent = Convert-ToBase64 -filePath $GraphQuerySetPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($GraphQuerySetEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $GraphQuerySetEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Graph Query Set Definition '$GraphQuerySetId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Graph Query Set definition '$GraphQuerySetId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Graph Query Set definition. Error: $errorDetails" -Level Error
    }
}
