<#
.SYNOPSIS
    Updates the definition of a Anomaly Detector item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Anomaly Detector item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Anomaly Detector item.

.PARAMETER AnomalyDetectorId
    The unique identifier of the Anomaly Detector item to update.

.PARAMETER AnomalyDetectorPathDefinition
    File path to the Anomaly Detector item definition JSON file to upload.

.PARAMETER AnomalyDetectorPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricAnomalyDetectorDefinition -WorkspaceId "workspace-12345" -AnomalyDetectorId "-67890" -AnomalyDetectorPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricAnomalyDetectorDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$AnomalyDetectorId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AnomalyDetectorPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AnomalyDetectorPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'anomalydetectors', $AnomalyDetectorId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($AnomalyDetectorPathDefinition) {
            $AnomalyDetectorEncodedContent = Convert-ToBase64 -filePath $AnomalyDetectorPathDefinition

            if (-not [string]::IsNullOrEmpty($AnomalyDetectorEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $AnomalyDetectorEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Anomaly Detector definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($AnomalyDetectorPathPlatformDefinition) {
            $AnomalyDetectorEncodedPlatformContent = Convert-ToBase64 -filePath $AnomalyDetectorPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($AnomalyDetectorEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $AnomalyDetectorEncodedPlatformContent
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
        $action = "Update Anomaly Detector Definition '$AnomalyDetectorId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Anomaly Detector definition '$AnomalyDetectorId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Anomaly Detector definition. Error: $errorDetails" -Level Error
    }
}
