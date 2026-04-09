<#
.SYNOPSIS
    Deletes a Anomaly Detector item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Anomaly Detector item
    from the specified workspace using the provided WorkspaceId and AnomalyDetectorId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Anomaly Detector item to be deleted.

.PARAMETER AnomalyDetectorId
    The unique identifier of the Anomaly Detector item to delete.

.EXAMPLE
    Remove-FabricAnomalyDetector -WorkspaceId "workspace-12345" -AnomalyDetectorId "-67890"
    Deletes the Anomaly Detector item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricAnomalyDetector {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$AnomalyDetectorId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'anomalydetectors' -ItemId $AnomalyDetectorId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Anomaly Detector '$AnomalyDetectorId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Anomaly Detector '$AnomalyDetectorId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Anomaly Detector '$AnomalyDetectorId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
