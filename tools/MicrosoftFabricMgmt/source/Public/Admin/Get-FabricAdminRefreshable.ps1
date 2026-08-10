<#
.SYNOPSIS
    Gets refreshable datasets using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminRefreshable cmdlet retrieves refreshable datasets using the admin API.

    When -CapacityId is supplied it returns the refreshables for that capacity via
    /admin/capacities/{capacityId}/refreshables. When -CapacityId is omitted it returns the
    org-wide list of refreshables across all capacities the caller can access via
    /admin/capacities/refreshables.

.PARAMETER CapacityId
    Optional. The capacity ID to get refreshables from. When omitted, the org-wide list is returned.

.PARAMETER RefreshableId
    Optional. Returns only the refreshable matching this ID. Requires -CapacityId.

.PARAMETER Expand
    Optional. Accepts a comma-separated list of data types to expand inline in the response
    (for example 'capacities' or 'groups').

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return. The org-wide API requires this; when omitted
    for the org-wide call a default of 1000 is used.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminRefreshable -CapacityId "capacity123"

    Lists all refreshables in the specified capacity.

.EXAMPLE
    Get-FabricAdminRefreshable

    Lists all refreshables across every capacity the caller can access (org-wide).

.EXAMPLE
    Get-FabricAdminRefreshable -CapacityId "capacity123" -RefreshableId "dataset123"

    Gets a specific refreshable by ID.

.NOTES
    - Uses the Power BI Admin API:
        https://api.powerbi.com/v1.0/myorg/admin/capacities/refreshables
        https://api.powerbi.com/v1.0/myorg/admin/capacities/{capacityId}/refreshables
    - Requires Fabric Administrator permissions.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricAdminRefreshable {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RefreshableId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Expand,

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

            if ($RefreshableId) {
                if (-not $CapacityId) {
                    Write-FabricLog -Message "-RefreshableId requires -CapacityId to be specified." -Level Error
                    return $null
                }
                $singleUri = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId/refreshables/$RefreshableId"
                if ($Expand) {
                    $singleUri = "$singleUri`?`$expand=$([System.Uri]::EscapeDataString($Expand))"
                }
                Write-FabricLog -Message "API Endpoint: $singleUri" -Level Debug

                $apiParams = @{
                    BaseURI = $singleUri
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    if ($Raw) {
                        return $response
                    }
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminRefreshable')
                    return $response
                }
                return $null
            }

            $queryParams = @()
            if ($Expand) {
                $queryParams += "`$expand=$([System.Uri]::EscapeDataString($Expand))"
            }
            if ($Filter) {
                $queryParams += "`$filter=$([System.Uri]::EscapeDataString($Filter))"
            }
            if ($Top) {
                $queryParams += "`$top=$Top"
            }
            elseif (-not $CapacityId) {
                # The org-wide refreshables endpoint requires $top; default it when omitted.
                $queryParams += "`$top=1000"
            }
            if ($Skip) {
                $queryParams += "`$skip=$Skip"
            }

            if ($CapacityId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId/refreshables"
            }
            else {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/refreshables"
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
                Write-FabricLog -Message "No refreshables returned." -Level Warning
                return $null
            }

            return Select-FabricResource -InputObject $response -ResourceType 'AdminRefreshable' -TypeName 'MicrosoftFabric.AdminRefreshable' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve refreshables. Error: $errorDetails" -Level Error
        }
    }
}
