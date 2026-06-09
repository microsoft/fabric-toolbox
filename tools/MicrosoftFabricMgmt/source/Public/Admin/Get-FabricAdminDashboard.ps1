<#
.SYNOPSIS
    Gets Power BI dashboards for the organization.

.DESCRIPTION
    The Get-FabricAdminDashboard cmdlet retrieves Power BI dashboards using the admin API.

.PARAMETER DashboardId
    Optional. Returns only the dashboard matching this ID.

.PARAMETER WorkspaceId
    Optional. Get dashboards from a specific workspace.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminDashboard

    Lists all dashboards in the tenant.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/dashboards
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DashboardId,

        [Parameter(Mandatory = $false)]
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

            if ($WorkspaceId -and $DashboardId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/dashboards/$DashboardId"
            }
            elseif ($WorkspaceId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/dashboards"
            }
            elseif ($DashboardId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/dashboards/$DashboardId"
                Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    if ($Raw) {
                        return $response
                    }
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminDashboard')
                    return $response
                }
                return $null
            }
            else {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/dashboards"
            }

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
                Write-FabricLog -Message "No dashboards returned." -Level Warning
                return $null
            }

            return Select-FabricResource -InputObject $response -ResourceType 'AdminDashboard' -TypeName 'MicrosoftFabric.AdminDashboard' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve dashboards. Error: $errorDetails" -Level Error
        }
    }
}
