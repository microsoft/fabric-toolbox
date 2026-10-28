<#
.SYNOPSIS
    Gets datasources for a Power BI dataset using the admin API, enriched with resolved names.

.DESCRIPTION
    The Get-FabricAdminDatasetDatasource cmdlet retrieves all datasources associated with
    a specific Power BI dataset using the admin API, then enriches each returned object
    with four additional properties:

    - datasetId:    the dataset ID that owns these datasources (input parameter)
    - DatasetName:  resolved via Resolve-FabricDatasetName (cached)
    - WorkspaceName: resolved via Resolve-FabricWorkspaceName using the workspace ID
                     cross-populated into cache by Resolve-FabricDatasetName (cached)
    - GatewayName:  resolved via Resolve-FabricGatewayName for each unique gatewayId
                    present on the datasource (cached)

    All name resolution uses PSFramework-backed caching, so repeated calls for the
    same dataset, workspace, or gateway incur no additional API cost.

    Pass -Raw to suppress all enrichment and receive the unmodified API response.

.PARAMETER DatasetId
    Required. The ID (GUID) of the dataset whose datasources should be retrieved.
    Accepts pipeline input by property name, making it compatible with the output
    of Get-FabricAdminDataset.

.PARAMETER Raw
    Optional. Returns the unmodified API response without adding any enrichment
    properties. Useful for export scenarios.

.EXAMPLE
    Get-FabricAdminDatasetDatasource -DatasetId "abcdef12-abcd-abcd-abcd-abcdef123456"

    Returns all datasources for the dataset, enriched with DatasetName, WorkspaceName,
    and GatewayName.

.EXAMPLE
    Get-FabricAdminDataset | Get-FabricAdminDatasetDatasource

    Retrieves all datasets in the tenant and pipes them to get their datasources.
    Name resolution is cached so each workspace and gateway is only looked up once.

.EXAMPLE
    Get-FabricAdminDatasetDatasource -DatasetId "abcdef12-abcd-abcd-abcd-abcdef123456" -Raw

    Returns raw datasource data without any enrichment.

.OUTPUTS
    System.Object
    Datasource objects with all API-returned properties plus datasetId, DatasetName,
    WorkspaceName, and GatewayName.

.NOTES
    - API Endpoint:
        GET https://api.powerbi.com/v1.0/myorg/admin/datasets/{datasetId}/datasources
    - Requires: Fabric Administrator permissions
    - Scope: Tenant.Read.All or Tenant.ReadWrite.All
    - Rate limit: max 300 requests/hour per tenant

    Author: Rob Sewell
#>
function Get-FabricAdminDatasetDatasource {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DatasetId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/datasets/$DatasetId/datasources"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No datasources returned for dataset '$DatasetId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve dataset name (also cross-populates DatasetWorkspaceId cache)
            $datasetName = $null
            try {
                $datasetName = Resolve-FabricDatasetName -DatasetId $DatasetId
            }
            catch {
                $datasetName = $DatasetId
                Write-FabricLog -Message "Failed to resolve dataset name for ID '$DatasetId': $($_.Exception.Message)" -Level Debug
            }

            # Retrieve the workspace ID from cache (cross-populated by Resolve-FabricDatasetName)
            $workspaceId = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.DatasetWorkspaceId_$DatasetId" -Fallback $null

            $workspaceName = $null
            if ($workspaceId) {
                try {
                    $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $workspaceId
                }
                catch {
                    $workspaceName = $workspaceId
                    Write-FabricLog -Message "Failed to resolve workspace name for ID '$workspaceId': $($_.Exception.Message)" -Level Debug
                }
            }

            foreach ($datasource in $response) {
                # Stamp dataset context onto each datasource
                $datasource | Add-Member -NotePropertyName 'datasetId'    -NotePropertyValue $DatasetId   -Force
                $datasource | Add-Member -NotePropertyName 'DatasetName'  -NotePropertyValue $datasetName  -Force

                if ($null -ne $workspaceName) {
                    $datasource | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
                }

                # Resolve gateway name if this datasource is bound to a gateway
                if ($datasource.gatewayId) {
                    $gatewayName = $null
                    try {
                        $gatewayName = Resolve-FabricGatewayName -GatewayId $datasource.gatewayId
                    }
                    catch {
                        $gatewayName = $datasource.gatewayId
                        Write-FabricLog -Message "Failed to resolve gateway name for ID '$($datasource.gatewayId)': $($_.Exception.Message)" -Level Debug
                    }
                    $datasource | Add-Member -NotePropertyName 'GatewayName' -NotePropertyValue $gatewayName -Force
                }
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminDatasetDatasource'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve datasources for dataset '$DatasetId'. Error: $errorDetails" -Level Error
        }
    }
}
