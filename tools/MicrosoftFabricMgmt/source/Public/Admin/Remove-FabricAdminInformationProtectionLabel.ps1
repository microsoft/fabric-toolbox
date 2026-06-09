<#
.SYNOPSIS
    Removes information protection labels from artifacts using the Power BI admin API.

.DESCRIPTION
    The Remove-FabricAdminInformationProtectionLabel cmdlet removes information protection labels from artifacts using the admin API.

.PARAMETER ArtifactId
    Required. The artifact ID to remove the label from.

.PARAMETER ArtifactType
    Required. The type of artifact: Dashboard, Dataset, Report, etc.

.EXAMPLE
    Remove-FabricAdminInformationProtectionLabel -ArtifactId "artifact123" -ArtifactType "Dashboard"

    Removes the label from a dashboard.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/informationprotection/removeLabels
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Remove-FabricAdminInformationProtectionLabel {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ArtifactId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ArtifactType
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/informationprotection/removeLabels"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                artifactId = $ArtifactId
                artifactType = $ArtifactType
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Artifact '$ArtifactId'", "Remove information protection label")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Information protection label removed from artifact '$ArtifactId'." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove information protection label. Error: $errorDetails" -Level Error
        }
    }
}
