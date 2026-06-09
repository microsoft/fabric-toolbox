<#
.SYNOPSIS
    Gets refreshable datasets from a capacity using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminRefreshable cmdlet retrieves refreshable datasets from a specific capacity using the admin API.

.PARAMETER CapacityId
    Required. The capacity ID to get refreshables from.

.PARAMETER RefreshableId
    Optional. Returns only the refreshable matching this ID.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminRefreshable -CapacityId "capacity123"

    Lists all refreshables in the specified capacity.

.EXAMPLE
    Get-FabricAdminRefreshable -CapacityId "capacity123" -RefreshableId "dataset123"

    Gets a specific refreshable by ID.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/capacities/{capacityId}/refreshables
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminRefreshable {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RefreshableId,

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
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId/refreshables/$RefreshableId"
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
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminRefreshable')
                    return $response
                }
                return $null
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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId/refreshables"
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
