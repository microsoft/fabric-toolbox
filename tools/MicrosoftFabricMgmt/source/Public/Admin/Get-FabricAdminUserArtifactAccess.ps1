<#
.SYNOPSIS
    Gets artifact access for a user using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminUserArtifactAccess cmdlet retrieves artifact access information for a specific user using the admin API.

.PARAMETER UserId
    Required. The user ID to get artifact access for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminUserArtifactAccess -UserId "user123"

    Gets all artifacts the specified user has access to.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/users/{userId}/artifactAccess
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminUserArtifactAccess {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$UserId,

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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/users/$UserId/artifactAccess"
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
                Write-FabricLog -Message "No artifact access returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($artifact in $response) {
                $artifact | Add-Member -NotePropertyName 'userId' -NotePropertyValue $UserId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminUserArtifactAccess'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve user artifact access. Error: $errorDetails" -Level Error
        }
    }
}
