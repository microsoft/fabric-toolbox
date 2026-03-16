<#
.SYNOPSIS
    Updates the definition of a Digital Twin Builder item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Digital Twin Builder item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder item.

.PARAMETER DigitalTwinBuilderId
    The unique identifier of the Digital Twin Builder item to update.

.PARAMETER DigitalTwinBuilderPathDefinition
    File path to the Digital Twin Builder item definition JSON file to upload.

.PARAMETER DigitalTwinBuilderPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricDigitalTwinBuilderDefinition -WorkspaceId "workspace-12345" -DigitalTwinBuilderId "-67890" -DigitalTwinBuilderPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricDigitalTwinBuilderDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'digitaltwinbuilders', $DigitalTwinBuilderId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($DigitalTwinBuilderPathDefinition) {
            $DigitalTwinBuilderEncodedContent = Convert-ToBase64 -filePath $DigitalTwinBuilderPathDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $DigitalTwinBuilderEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Digital Twin Builder definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($DigitalTwinBuilderPathPlatformDefinition) {
            $DigitalTwinBuilderEncodedPlatformContent = Convert-ToBase64 -filePath $DigitalTwinBuilderPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $DigitalTwinBuilderEncodedPlatformContent
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
        $action = "Update Digital Twin Builder Definition '$DigitalTwinBuilderId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Digital Twin Builder definition '$DigitalTwinBuilderId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Digital Twin Builder definition. Error: $errorDetails" -Level Error
    }
}
