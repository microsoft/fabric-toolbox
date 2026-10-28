<#
.SYNOPSIS
    Gets Power BI datasets for the organization and enriches them with resolved names.

.DESCRIPTION
    The Get-FabricAdminDataset cmdlet retrieves Power BI datasets using the admin API
    and enriches each returned object with two additional properties:

    - DatasetName: a promoted copy of the dataset's name property for easy display
    - WorkspaceName: the human-readable workspace name resolved from the workspaceId
      using the caching infrastructure (Resolve-FabricWorkspaceName)

    This means the objects passed down the pipeline carry all the context needed for
    readable output, CSV export, or further filtering — without relying on the
    ps1xml format file.

    Pass -Raw to suppress enrichment and receive the unmodified API response. This
    is also used internally by Resolve-FabricDatasetName to avoid circular enrichment.

.PARAMETER DatasetId
    Optional. Returns only the dataset matching this ID. Can be combined with
    WorkspaceId to scope the lookup to a specific workspace.

.PARAMETER WorkspaceId
    Optional. Returns only datasets belonging to this workspace. Can be combined
    with DatasetId to retrieve a single dataset within a workspace.

.PARAMETER Filter
    Optional. OData filter expression applied server-side (e.g. "isRefreshable eq true").

.PARAMETER Top
    Optional. Maximum number of datasets to return (1–5000).

.PARAMETER Skip
    Optional. Number of datasets to skip before returning results (for paging).

.PARAMETER Raw
    Optional. Returns the unmodified API response without adding DatasetName or
    WorkspaceName properties. Useful for export scenarios or when called internally
    by name-resolution functions.

.EXAMPLE
    Get-FabricAdminDataset

    Lists all datasets in the tenant with DatasetName and WorkspaceName resolved.

.EXAMPLE
    Get-FabricAdminDataset -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all datasets in the specified workspace with enriched names.

.EXAMPLE
    Get-FabricAdminDataset -DatasetId "abcdef12-abcd-abcd-abcd-abcdef123456"

    Returns the single dataset with that ID, enriched with DatasetName and WorkspaceName.

.EXAMPLE
    Get-FabricAdminDataset -Filter "isRefreshable eq true" -Top 100

    Returns up to 100 refreshable datasets, enriched.

.EXAMPLE
    Get-FabricAdminDataset -Raw | Export-Csv datasets.csv -NoTypeInformation

    Exports raw dataset data to CSV without any enrichment overhead.

.OUTPUTS
    System.Object
    Dataset objects with all API-returned properties plus DatasetName and WorkspaceName.

.NOTES
    - API Endpoints:
        GET https://api.powerbi.com/v1.0/myorg/admin/datasets
        GET https://api.powerbi.com/v1.0/myorg/admin/datasets/{datasetId}
        GET https://api.powerbi.com/v1.0/myorg/admin/groups/{groupId}/datasets
        GET https://api.powerbi.com/v1.0/myorg/admin/groups/{groupId}/datasets/{datasetId}
    - Requires: Fabric Administrator permissions
    - Scope: Tenant.Read.All or Tenant.ReadWrite.All
    - Rate limit: max 50 requests/hour or 5 requests/minute per tenant

    Author: Rob Sewell
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

            # Determine the correct endpoint based on supplied parameters
            if ($WorkspaceId -and $DatasetId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/datasets/$DatasetId"
            }
            elseif ($WorkspaceId) {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/datasets"
            }
            elseif ($DatasetId) {
                # Single dataset by ID — handled separately (no query params, different response shape)
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/datasets/$DatasetId"
                Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                Add-FabricDatasetProperties -Dataset $response
                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminDataset'
                return $response
            }
            else {
                $apiEndpointURI = "$powerBIAdminBaseUrl/admin/datasets"
            }

            # Build optional OData query string
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

            if ($Raw) {
                return $response
            }

            foreach ($dataset in $response) {
                Add-FabricDatasetProperties -Dataset $dataset
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminDataset'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve datasets. Error: $errorDetails" -Level Error
        }
    }
}

# Internal helper — adds DatasetName and WorkspaceName directly to the dataset object.
# Kept in the same file so it stays co-located with the function it supports.
function Add-FabricDatasetProperties {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [object]$Dataset
    )

    # Promote 'name' as DatasetName for consistency with other enriched objects
    $Dataset | Add-Member -NotePropertyName 'DatasetName' -NotePropertyValue $Dataset.name -Force

    # Resolve and attach the workspace display name (cached after first lookup)
    if ($Dataset.workspaceId) {
        $workspaceName = $null
        try {
            $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $Dataset.workspaceId
        }
        catch {
            $workspaceName = $Dataset.workspaceId
            Write-FabricLog -Message "Failed to resolve workspace name for ID '$($Dataset.workspaceId)': $($_.Exception.Message)" -Level Debug
        }
        $Dataset | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
    }
}
