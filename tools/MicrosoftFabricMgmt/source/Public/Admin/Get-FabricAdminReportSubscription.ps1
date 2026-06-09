<#
.SYNOPSIS
    Gets subscriptions for a report using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminReportSubscription cmdlet retrieves subscriptions for a specific report using the admin API.

.PARAMETER ReportId
    Required. The report ID to get subscriptions for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminReportSubscription -ReportId "report123"

    Lists all subscriptions for the specified report.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/reports/{reportId}/subscriptions
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminReportSubscription {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ReportId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Filter,

        [Parameter(Mandatory = $false)]
        [ValidateRange(1, 5000)]
        [int]$Top,

        [Parameter(Mandatory = $false)]
        [ValidateRange(0, [int]::MaxValue)]
        [int]$Skip,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"

            $queryParams = @()
            if ($Filter) {
                $queryParams += "`$filter=$([System.Uri]::EscapeDataString($Filter))"
            }
            if ($Top) {
                $queryParams += "`$top=$Top"
            }
            if ($Skip) {
                $queryParams += "`$skip=$Skip"
            }

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/reports/$ReportId/subscriptions"
            if ($queryParams.Count -gt 0) {
                $apiEndpointURI = "$apiEndpointURI`?$($queryParams -join '&')"
            }

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No report subscriptions returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($subscription in $response) {
                $subscription | Add-Member -NotePropertyName 'reportId' -NotePropertyValue $ReportId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminReportSubscription'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve report subscriptions. Error: $errorDetails" -Level Error
        }
    }
}
