<#
.SYNOPSIS
    Gets widely shared artifact links shared to the whole organization using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminWidelySharedArtifactLink cmdlet retrieves artifacts that are shared as links to the whole organization using the admin API.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminWidelySharedArtifactLink

    Lists all artifacts with links shared to the whole organization.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/widelySharedArtifacts/linksSharedToWholeOrganization
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminWidelySharedArtifactLink {
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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/widelySharedArtifacts/linksSharedToWholeOrganization"
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
                Write-FabricLog -Message "No widely shared artifact links returned." -Level Warning
                return $null
            }

            return Select-FabricResource -InputObject $response -ResourceType 'AdminWidelySharedArtifactLink' -TypeName 'MicrosoftFabric.AdminWidelySharedArtifactLink' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve widely shared artifact links. Error: $errorDetails" -Level Error
        }
    }
}
