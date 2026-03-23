<#
.SYNOPSIS
    Gets datasources for a dataflow using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminDataflowDatasource cmdlet retrieves datasources for a specific dataflow using the admin API.

.PARAMETER DataflowId
    Required. The dataflow ID to get datasources for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminDataflowDatasource -DataflowId "dataflow123"

    Lists all datasources for the specified dataflow.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/dataflows/{dataflowId}/datasources
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminDataflowDatasource {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataflowId,

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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/dataflows/$DataflowId/datasources"
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
                Write-FabricLog -Message "No dataflow datasources returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($datasource in $response) {
                $datasource | Add-Member -NotePropertyName 'dataflowId' -NotePropertyValue $DataflowId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminDataflowDatasource'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve dataflow datasources. Error: $errorDetails" -Level Error
        }
    }
}
