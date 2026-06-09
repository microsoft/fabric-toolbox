<#
.SYNOPSIS
    Gets unused artifacts in a workspace using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminWorkspaceUnusedArtifact cmdlet retrieves unused artifacts in a specific workspace using the admin API.

.PARAMETER WorkspaceId
    Required. The workspace ID to get unused artifacts for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminWorkspaceUnusedArtifact -WorkspaceId "workspace123"

    Lists all unused artifacts in the specified workspace.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/groups/{workspaceId}/UnusedArtifacts
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminWorkspaceUnusedArtifact {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/UnusedArtifacts"
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
                Write-FabricLog -Message "No unused artifacts returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($artifact in $response) {
                $artifact | Add-Member -NotePropertyName 'workspaceId' -NotePropertyValue $WorkspaceId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminWorkspaceUnusedArtifact'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve unused artifacts. Error: $errorDetails" -Level Error
        }
    }
}
