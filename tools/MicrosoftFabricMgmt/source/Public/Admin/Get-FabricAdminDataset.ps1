<#
.SYNOPSIS
    Gets Power BI datasets for the organization.

.DESCRIPTION
    The Get-FabricAdminDataset cmdlet retrieves Power BI datasets using the admin API.

.PARAMETER DatasetId
    Optional. Returns only the dataset matching this ID.

.PARAMETER WorkspaceId
    Optional. Get datasets from a specific workspace.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminDataset

    Lists all datasets in the tenant.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/datasets
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminDataset {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DatasetId,

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

            if ($WorkspaceId -and $DatasetId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/datasets/$DatasetId"
            }
            elseif ($WorkspaceId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/datasets"
            }
            elseif ($DatasetId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/datasets/$DatasetId"
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
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminDataset')
                    return $response
                }
                return $null
            }
            else {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/datasets"
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
                Write-FabricLog -Message "No datasets returned." -Level Warning
                return $null
            }

            return Select-FabricResource -InputObject $response -ResourceType 'AdminDataset' -TypeName 'MicrosoftFabric.AdminDataset' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve datasets. Error: $errorDetails" -Level Error
        }
    }
}
