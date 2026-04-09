<#
.SYNOPSIS
    Gets upstream dataflows for a dataflow using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminDataflowUpstream cmdlet retrieves upstream dataflows for a specific dataflow in a workspace using the admin API.

.PARAMETER WorkspaceId
    Required. The workspace ID containing the dataflow.

.PARAMETER DataflowId
    Required. The dataflow ID to get upstream dataflows for.

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminDataflowUpstream -WorkspaceId "workspace123" -DataflowId "dataflow123"

    Lists all upstream dataflows for the specified dataflow.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/groups/{workspaceId}/dataflows/{dataflowId}/upstreamDataflows
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminDataflowUpstream {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

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

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/dataflows/$DataflowId/upstreamDataflows"
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
                Write-FabricLog -Message "No upstream dataflows returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            foreach ($dataflow in $response) {
                $dataflow | Add-Member -NotePropertyName 'workspaceId' -NotePropertyValue $WorkspaceId -Force
                $dataflow | Add-Member -NotePropertyName 'dataflowId' -NotePropertyValue $DataflowId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminDataflowUpstream'

            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve upstream dataflows. Error: $errorDetails" -Level Error
        }
    }
}
