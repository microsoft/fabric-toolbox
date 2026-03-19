<#
.SYNOPSIS
    Updates the definition of a Event Schema Set item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Event Schema Set item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Event Schema Set item.

.PARAMETER EventSchemaSetId
    The unique identifier of the Event Schema Set item to update.

.PARAMETER EventSchemaSetPathDefinition
    File path to the Event Schema Set item definition JSON file to upload.

.PARAMETER EventSchemaSetPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricEventSchemaSetDefinition -WorkspaceId "workspace-12345" -EventSchemaSetId "-67890" -EventSchemaSetPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricEventSchemaSetDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventSchemaSetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventSchemaSetPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventSchemaSetPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'eventSchemaSets', $EventSchemaSetId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($EventSchemaSetPathDefinition) {
            $EventSchemaSetEncodedContent = Convert-ToBase64 -filePath $EventSchemaSetPathDefinition

            if (-not [string]::IsNullOrEmpty($EventSchemaSetEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $EventSchemaSetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Event Schema Set definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($EventSchemaSetPathPlatformDefinition) {
            $EventSchemaSetEncodedPlatformContent = Convert-ToBase64 -filePath $EventSchemaSetPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($EventSchemaSetEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventSchemaSetEncodedPlatformContent
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
        $action = "Update Event Schema Set Definition '$EventSchemaSetId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Event Schema Set definition '$EventSchemaSetId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Event Schema Set definition. Error: $errorDetails" -Level Error
    }
}
