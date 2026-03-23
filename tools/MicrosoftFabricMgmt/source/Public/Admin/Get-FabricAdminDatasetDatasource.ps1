<#
.SYNOPSIS
    Gets datasources for a dataset using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminDatasetDatasource cmdlet retrieves datasources for a specific dataset using the admin API.

.PARAMETER DatasetId
    Required. The dataset ID to get datasources for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminDatasetDatasource -DatasetId "dataset123"

    Lists all datasources for the specified dataset.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/datasets/{datasetId}/datasources
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminDatasetDatasource {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DatasetId,

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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/datasets/$DatasetId/datasources"
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
                Write-FabricLog -Message "No dataset datasources returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($datasource in $response) {
                $datasource | Add-Member -NotePropertyName 'datasetId' -NotePropertyValue $DatasetId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminDatasetDatasource'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve dataset datasources. Error: $errorDetails" -Level Error
        }
    }
}
