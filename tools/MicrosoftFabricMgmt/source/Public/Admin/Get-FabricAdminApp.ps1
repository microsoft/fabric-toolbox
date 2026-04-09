<#
.SYNOPSIS
    Gets apps from the Power BI admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminApp cmdlet retrieves Power BI apps using the Power BI admin API endpoint
    (https://api.powerbi.com/v1.0/myorg/admin/apps). This provides tenant-wide visibility into all
    apps (including those the user doesn't have access to). Requires Fabric Administrator permissions.

.PARAMETER AppId
    Optional. Returns only the app matching this ID.

.PARAMETER Filter
    Optional. OData filter expression to filter the results (e.g., "contains(name,'sales')").

.PARAMETER Top
    Optional. Maximum number of apps to return.

.PARAMETER Skip
    Optional. Number of apps to skip (for pagination).

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminApp

    Lists all apps in the tenant.

.EXAMPLE
    Get-FabricAdminApp -Top 100

    Lists the first 100 apps in the tenant.

.EXAMPLE
    Get-FabricAdminApp -Filter "contains(name,'Sales')"

    Lists apps with 'Sales' in the name.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/apps
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.

    Author: Claude AI
#>
function Get-FabricAdminApp {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$AppId,

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

            if ($AppId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/apps/$AppId"
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
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminApp')
                    return $response
                }
                return $null
            }

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
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/apps"
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
                Write-FabricLog -Message "No apps returned from admin API." -Level Warning
                return $null
            }

            # Use Select-FabricResource for type decoration
            return Select-FabricResource -InputObject $response -ResourceType 'AdminApp' -TypeName 'MicrosoftFabric.AdminApp' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve apps from admin API. Error: $errorDetails" -Level Error
        }
    }
}
