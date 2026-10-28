<#
.SYNOPSIS
    Gets reports from the Power BI admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminReport cmdlet retrieves Power BI reports using the Power BI admin API.
    This provides tenant-wide visibility into all reports (including those the user doesn't
    have direct access to). Requires Fabric Administrator permissions.

    When -WorkspaceId is supplied the workspace-scoped endpoint is used:
        GET /admin/groups/{workspaceId}/reports
    This is significantly faster and smaller than the tenant-wide call when you only need
    reports from specific workspaces.

    When neither -WorkspaceId nor -Filter is supplied the tenant-wide endpoint is used:
        GET /admin/reports
    Note: this can return tens of thousands of rows in large tenants. Prefer -WorkspaceId
    or a targeted -Filter when possible.

.PARAMETER WorkspaceId
    Optional. Returns only reports belonging to this workspace. Uses the workspace-scoped
    admin endpoint, which is much faster than the tenant-wide call.
    Accepts pipeline input by property name.

.PARAMETER Filter
    Optional. OData filter expression applied server-side (e.g. "contains(name,'sales')").
    Ignored when -WorkspaceId is supplied (workspace-scoped endpoint does not support $filter).

.PARAMETER Top
    Optional. Maximum number of reports to return.

.PARAMETER Skip
    Optional. Number of reports to skip (for pagination).

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminReport

    Lists all reports in the tenant. Can be large — consider scoping with -WorkspaceId.

.EXAMPLE
    Get-FabricAdminReport -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all reports in the specified workspace using the faster workspace-scoped endpoint.

.EXAMPLE
    Get-FabricAdminReport -Top 100

    Lists the first 100 reports in the tenant.

.EXAMPLE
    Get-FabricAdminReport -Filter "contains(name,'Sales')"

    Lists reports with 'Sales' in the name.

.NOTES
    - API Endpoints:
        GET https://api.powerbi.com/v1.0/myorg/admin/reports
        GET https://api.powerbi.com/v1.0/myorg/admin/groups/{groupId}/reports
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricAdminReport {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

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

            if ($WorkspaceId) {
                # Workspace-scoped endpoint — much faster, no $filter support
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/reports"
                Write-FabricLog -Message "API Endpoint (workspace-scoped): $apiEndpointURI" -Level Debug
            }
            else {
                # Tenant-wide endpoint — supports OData query params
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

                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/reports"
                if ($queryParams.Count -gt 0) {
                    $apiEndpointURI = "$apiEndpointURI`?$($queryParams -join '&')"
                }
                Write-FabricLog -Message "API Endpoint (tenant-wide): $apiEndpointURI" -Level Debug
            }

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

            return Select-FabricResource -InputObject $response -ResourceType 'AdminReport' -TypeName 'MicrosoftFabric.AdminReport' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve reports from admin API. Error: $errorDetails" -Level Error
        }
    }
}
