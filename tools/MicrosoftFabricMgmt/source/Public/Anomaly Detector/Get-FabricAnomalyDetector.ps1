<#
.SYNOPSIS
    Retrieves details of one or more Anomaly Detector items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Anomaly Detector information from a Microsoft Fabric workspace by AnomalyDetectorId or AnomalyDetectorName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Anomaly Detector(s).
    If neither AnomalyDetectorId nor AnomalyDetectorName is specified, returns all Anomaly Detector items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Anomaly Detector item(s). This parameter is required.

.PARAMETER AnomalyDetectorId
    The unique identifier of the Anomaly Detector item to retrieve. Optional; specify either AnomalyDetectorId or AnomalyDetectorName, not both.

.PARAMETER AnomalyDetectorName
    The display name of the Anomaly Detector item to retrieve. Optional; specify either AnomalyDetectorId or AnomalyDetectorName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricAnomalyDetector -WorkspaceId "workspace-12345" -AnomalyDetectorId "AnomalyDetector-67890"
    Retrieves the Anomaly Detector with ID "AnomalyDetector-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricAnomalyDetector -WorkspaceId "workspace-12345" -AnomalyDetectorName "My Anomaly Detector"
    Retrieves the Anomaly Detector named "My Anomaly Detector" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricAnomalyDetector -WorkspaceId "workspace-12345"
    Retrieves all Anomaly Detector items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricAnomalyDetector -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Anomaly Detector items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricAnomalyDetector {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AnomalyDetectorId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$AnomalyDetectorName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'anomalydetectors'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $AnomalyDetectorId -DisplayName $AnomalyDetectorName -ResourceType 'Anomaly Detector' -TypeName 'MicrosoftFabric.AnomalyDetector' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Anomaly Detector for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
