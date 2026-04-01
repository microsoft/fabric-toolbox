<#
.SYNOPSIS
    Sets information protection labels on artifacts using the Power BI admin API.

.DESCRIPTION
    The Set-FabricAdminInformationProtectionLabel cmdlet applies information protection labels to artifacts using the admin API.

.PARAMETER ArtifactId
    Required. The artifact ID to label.

.PARAMETER ArtifactType
    Required. The type of artifact: Dashboard, Dataset, Report, etc.

.PARAMETER LabelId
    Required. The label ID to apply.

.EXAMPLE
    Set-FabricAdminInformationProtectionLabel -ArtifactId "artifact123" -ArtifactType "Dashboard" -LabelId "label456"

    Applies a label to a dashboard.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/informationprotection/setLabels
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Set-FabricAdminInformationProtectionLabel {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ArtifactId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ArtifactType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LabelId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/informationprotection/setLabels"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                artifactId = $ArtifactId
                artifactType = $ArtifactType
                labelId = $LabelId
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Artifact '$ArtifactId'", "Set information protection label")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Information protection label set on artifact '$ArtifactId'." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to set information protection label. Error: $errorDetails" -Level Error
        }
    }
}
