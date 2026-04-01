<#
.SYNOPSIS
    Updates the definition of a Operations Agent item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Operations Agent item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Operations Agent item.

.PARAMETER OperationsAgentId
    The unique identifier of the Operations Agent item to update.

.PARAMETER OperationsAgentPathDefinition
    File path to the Operations Agent item definition JSON file to upload.

.PARAMETER OperationsAgentPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricOperationsAgentDefinition -WorkspaceId "workspace-12345" -OperationsAgentId "-67890" -OperationsAgentPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricOperationsAgentDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'OperationsAgents', $OperationsAgentId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($OperationsAgentPathDefinition) {
            $OperationsAgentEncodedContent = Convert-ToBase64 -filePath $OperationsAgentPathDefinition

            if (-not [string]::IsNullOrEmpty($OperationsAgentEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $OperationsAgentEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Operations Agent definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($OperationsAgentPathPlatformDefinition) {
            $OperationsAgentEncodedPlatformContent = Convert-ToBase64 -filePath $OperationsAgentPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($OperationsAgentEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $OperationsAgentEncodedPlatformContent
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
        $action = "Update Operations Agent Definition '$OperationsAgentId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Operations Agent definition '$OperationsAgentId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Operations Agent definition. Error: $errorDetails" -Level Error
    }
}
