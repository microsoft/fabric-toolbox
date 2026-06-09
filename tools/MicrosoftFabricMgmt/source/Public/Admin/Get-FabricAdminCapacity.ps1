<#
.SYNOPSIS
    Gets Power BI capacities for the organization.

.DESCRIPTION
    The Get-FabricAdminCapacity cmdlet retrieves Power BI capacities using the admin API.

.PARAMETER CapacityId
    Optional. Returns only the capacity matching this ID.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminCapacity

    Lists all capacities.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/capacities
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminCapacity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

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

            if ($CapacityId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId"
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
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminCapacity')
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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities"
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
                Write-FabricLog -Message "No capacities returned." -Level Warning
                return $null
            }

            return Select-FabricResource -InputObject $response -ResourceType 'AdminCapacity' -TypeName 'MicrosoftFabric.AdminCapacity' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve capacities. Error: $errorDetails" -Level Error
        }
    }
}
