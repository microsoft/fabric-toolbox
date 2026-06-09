<#
.SYNOPSIS
    Updates the properties of a Anomaly Detector item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a PATCH operation on the Microsoft Fabric API to update a Anomaly Detector item's
    properties in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Anomaly Detector item to be updated.

.PARAMETER AnomalyDetectorId
    The unique identifier of the Anomaly Detector item to update.

.PARAMETER AnomalyDetectorDescription
    The new description for the Anomaly Detector item.

.PARAMETER AnomalyDetectorDisplayName
    The new display name for the Anomaly Detector item.

.EXAMPLE
    Update-FabricAnomalyDetector -WorkspaceId "workspace-12345" -AnomalyDetectorId "-67890" -AnomalyDetectorDescription "Updated description"

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Update-FabricAnomalyDetector {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$AnomalyDetectorId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AnomalyDetectorDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AnomalyDetectorDisplayName
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'anomalydetectors' -ItemId $AnomalyDetectorId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body with only provided parameters
        $body = @{}

        if ($AnomalyDetectorDisplayName) {
            $body.displayName = $AnomalyDetectorDisplayName
        }

        if ($AnomalyDetectorDescription) {
            $body.description = $AnomalyDetectorDescription
        }

        # Only proceed if there are updates to apply
        if ($body.Count -eq 0) {
            Write-FabricLog -Message "No updates specified for Anomaly Detector '$AnomalyDetectorId'." -Level Warning
            return
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Anomaly Detector '$AnomalyDetectorId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Anomaly Detector '$AnomalyDetectorId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Anomaly Detector '$AnomalyDetectorId'. Error: $errorDetails" -Level Error
    }
}
