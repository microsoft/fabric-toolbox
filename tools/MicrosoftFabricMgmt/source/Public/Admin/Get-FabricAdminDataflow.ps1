<#
.SYNOPSIS
    Gets Power BI dataflows for the organization.

.DESCRIPTION
    The Get-FabricAdminDataflow cmdlet retrieves Power BI dataflows using the admin API.

.PARAMETER DataflowId
    Optional. Returns only the dataflow matching this ID.

.PARAMETER WorkspaceId
    Optional. Get dataflows from a specific workspace.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminDataflow

    Lists all dataflows in the tenant.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/dataflows
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminDataflow {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataflowId,

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

            if ($WorkspaceId -and $DataflowId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/dataflows/$DataflowId"
            }
            elseif ($WorkspaceId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/dataflows"
            }
            elseif ($DataflowId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/dataflows/$DataflowId"
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
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminDataflow')
                    return $response
                }
                return $null
            }
            else {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/dataflows"
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
                Write-FabricLog -Message "No dataflows returned." -Level Warning
                return $null
            }

            return Select-FabricResource -InputObject $response -ResourceType 'AdminDataflow' -TypeName 'MicrosoftFabric.AdminDataflow' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve dataflows. Error: $errorDetails" -Level Error
        }
    }
}
