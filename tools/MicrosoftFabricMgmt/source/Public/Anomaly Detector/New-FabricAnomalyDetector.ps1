<#
.SYNOPSIS
    Creates a new Anomaly Detector item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Anomaly Detector item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Anomaly Detector item will be created. Mandatory.

.PARAMETER AnomalyDetectorName
    The name of the Anomaly Detector item to be created. Mandatory.

.PARAMETER AnomalyDetectorDescription
    Optional description for the Anomaly Detector item.

.PARAMETER AnomalyDetectorPathDefinition
    Optional file path to the Anomaly Detector item definition JSON file.

.PARAMETER AnomalyDetectorPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricAnomalyDetector -WorkspaceId "workspace-12345" -AnomalyDetectorName "New Anomaly Detector" -AnomalyDetectorDescription "Description of the new Anomaly Detector item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricAnomalyDetector {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$AnomalyDetectorName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AnomalyDetectorDescription,

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
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'anomalydetectors'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $AnomalyDetectorName
        }

        if ($AnomalyDetectorDescription) {
            $body.description = $AnomalyDetectorDescription
        }

        # Add Anomaly Detector item definition file content if provided
        if ($AnomalyDetectorPathDefinition) {
            $AnomalyDetectorEncodedContent = Convert-ToBase64 -filePath $AnomalyDetectorPathDefinition

            if (-not [string]::IsNullOrEmpty($AnomalyDetectorEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
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
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
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

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create Anomaly Detector '$AnomalyDetectorName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Anomaly Detector '$AnomalyDetectorName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Anomaly Detector. Error: $errorDetails" -Level Error
    }
}

