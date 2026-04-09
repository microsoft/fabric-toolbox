<#
.SYNOPSIS
    Updates the definition of a Map item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Map item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Map item.

.PARAMETER MapId
    The unique identifier of the Map item to update.

.PARAMETER MapPathDefinition
    File path to the Map item definition JSON file to upload.

.PARAMETER MapPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricMapDefinition -WorkspaceId "workspace-12345" -MapId "-67890" -MapPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricMapDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MapId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MapPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MapPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'Maps', $MapId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($MapPathDefinition) {
            $MapEncodedContent = Convert-ToBase64 -filePath $MapPathDefinition

            if (-not [string]::IsNullOrEmpty($MapEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $MapEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Map definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($MapPathPlatformDefinition) {
            $MapEncodedPlatformContent = Convert-ToBase64 -filePath $MapPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($MapEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MapEncodedPlatformContent
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
        $action = "Update Map Definition '$MapId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Map definition '$MapId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Map definition. Error: $errorDetails" -Level Error
    }
}
