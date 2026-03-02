<#
.SYNOPSIS
    Gets reports from the Power BI admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminReport cmdlet retrieves Power BI reports using the Power BI admin API endpoint
    (https://api.powerbi.com/v1.0/myorg/admin/reports). This provides tenant-wide visibility into all
    reports (including those the user doesn't have access to). Requires Fabric Administrator permissions.

.PARAMETER Filter
    Optional. OData filter expression to filter the results (e.g., "contains(name,'sales')").

.PARAMETER Top
    Optional. Maximum number of reports to return.

.PARAMETER Skip
    Optional. Number of reports to skip (for pagination).

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminReport

    Lists all reports in the tenant.

.EXAMPLE
    Get-FabricAdminReport -Top 100

    Lists the first 100 reports in the tenant.

.EXAMPLE
    Get-FabricAdminReport -Filter "contains(name,'Sales')"

    Lists reports with 'Sales' in the name.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/reports
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminReport {
    [CmdletBinding()]
    param (
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

            # Power BI Admin API base URL
            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"

            # Build query parameters
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

            # Construct the API endpoint URI
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/reports"
            if ($queryParams.Count -gt 0) {
                $apiEndpointURI = "$apiEndpointURI`?$($queryParams -join '&')"
            }

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No reports returned from admin API." -Level Warning
                return $null
            }

            # Use Select-FabricResource for type decoration
            return Select-FabricResource -InputObject $response -ResourceType 'AdminReport' -TypeName 'MicrosoftFabric.AdminReport' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve reports from admin API. Error: $errorDetails" -Level Error
        }
    }
}
