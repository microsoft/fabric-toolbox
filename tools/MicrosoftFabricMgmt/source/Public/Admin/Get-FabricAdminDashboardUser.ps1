<#
.SYNOPSIS
    Gets users with access to a dashboard using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminDashboardUser cmdlet retrieves users with access to a specific dashboard using the admin API.

.PARAMETER DashboardId
    Required. The dashboard ID to get users for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminDashboardUser -DashboardId "dashboard123"

    Lists all users with access to the specified dashboard.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/dashboards/{dashboardId}/users
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminDashboardUser {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DashboardId,

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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/dashboards/$DashboardId/users"
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
                Write-FabricLog -Message "No dashboard users returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($user in $response) {
                $user | Add-Member -NotePropertyName 'dashboardId' -NotePropertyValue $DashboardId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminDashboardUser'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve dashboard users. Error: $errorDetails" -Level Error
        }
    }
}
