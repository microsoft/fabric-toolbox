<#
.SYNOPSIS
    Updates the definition of a Digital Twin Builder Flow item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Digital Twin Builder Flow item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder Flow item.

.PARAMETER DigitalTwinBuilderFlowId
    The unique identifier of the Digital Twin Builder Flow item to update.

.PARAMETER DigitalTwinBuilderFlowPathDefinition
    File path to the Digital Twin Builder Flow item definition JSON file to upload.

.PARAMETER DigitalTwinBuilderFlowPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricDigitalTwinBuilderFlowDefinition -WorkspaceId "workspace-12345" -DigitalTwinBuilderFlowId "-67890" -DigitalTwinBuilderFlowPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricDigitalTwinBuilderFlowDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'DigitalTwinBuilderFlows', $DigitalTwinBuilderFlowId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($DigitalTwinBuilderFlowPathDefinition) {
            $DigitalTwinBuilderFlowEncodedContent = Convert-ToBase64 -filePath $DigitalTwinBuilderFlowPathDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderFlowEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $DigitalTwinBuilderFlowEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Digital Twin Builder Flow definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($DigitalTwinBuilderFlowPathPlatformDefinition) {
            $DigitalTwinBuilderFlowEncodedPlatformContent = Convert-ToBase64 -filePath $DigitalTwinBuilderFlowPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderFlowEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $DigitalTwinBuilderFlowEncodedPlatformContent
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
        $action = "Update Digital Twin Builder Flow Definition '$DigitalTwinBuilderFlowId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Digital Twin Builder Flow definition '$DigitalTwinBuilderFlowId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Digital Twin Builder Flow definition. Error: $errorDetails" -Level Error
    }
}
