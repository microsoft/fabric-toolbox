<#
.SYNOPSIS
    Gets users with access to a capacity using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminCapacityUser cmdlet retrieves users with access to a specific capacity using the admin API.

.PARAMETER CapacityId
    Required. The capacity ID to get users for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminCapacityUser -CapacityId "capacity123"

    Lists all users with access to the specified capacity.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/capacities/{capacityId}/users
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminCapacityUser {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId/users"
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
                Write-FabricLog -Message "No capacity users returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($user in $response) {
                $user | Add-Member -NotePropertyName 'capacityId' -NotePropertyValue $CapacityId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminCapacityUser'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve capacity users. Error: $errorDetails" -Level Error
        }
    }
}
