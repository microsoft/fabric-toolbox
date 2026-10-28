function Resolve-FabricDatasetName {
    <#
    .SYNOPSIS
        Resolves a Power BI Dataset ID to its display name.

    .DESCRIPTION
        Looks up the dataset display name from a dataset ID (GUID) using the admin API.
        Results are cached using PSFramework's configuration system for performance.

        As a side effect of the API call, the dataset's workspace ID is also cached
        under the key "DatasetWorkspaceId_{DatasetId}" to avoid redundant API calls
        when callers subsequently need to resolve the workspace name.

        The cache persists for the session lifetime and is shared across all
        functions. Use Clear-FabricNameCache to clear the cache if needed.

    .PARAMETER DatasetId
        The dataset ID (GUID) to resolve.

    .PARAMETER DisableCache
        If specified, bypasses the cache and always makes a fresh API call.

    .EXAMPLE
        Resolve-FabricDatasetName -DatasetId "12345-abcd-efgh"

        Returns the display name for the specified dataset, using cache if available.

    .EXAMPLE
        Resolve-FabricDatasetName -DatasetId "12345-abcd-efgh" -DisableCache

        Forces a fresh API call, bypassing the cache.

    .NOTES
    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
        This function uses PSFramework's configuration system for caching.
        Cache key format: "DatasetName_{DatasetId}"
        Cross-populates: "DatasetWorkspaceId_{DatasetId}" for workspace resolution.
        Requires Fabric Administrator permissions (Tenant.Read.All or Tenant.ReadWrite.All scope).
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [Alias('Id')]
        [string]$DatasetId,

        [Parameter()]
        [switch]$DisableCache
    )

    process {
        # Generate cache key
        $cacheKey = "DatasetName_$DatasetId"

        # Check cache first (unless disabled)
        if (-not $DisableCache) {
            $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Fallback $null

            if ($cached) {
                Write-PSFMessage -Level Debug -Message "Cache hit for dataset ID '$DatasetId': $cached"
                return $cached
            }
        }

        # Cache miss or disabled - make API call
        Write-PSFMessage -Level Debug -Message "Cache miss for dataset ID '$DatasetId' - resolving via API"

        try {
            # Use -Raw to retrieve the unmodified API object without triggering downstream enrichment
            $dataset = Get-FabricAdminDataset -DatasetId $DatasetId -Raw -ErrorAction Stop

            if ($dataset -and $dataset.name) {
                $name = $dataset.name

                # Cache the result (unless caching is disabled)
                if (-not $DisableCache) {
                    Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $name
                    Write-PSFMessage -Level Debug -Message "Cached dataset name '$name' for ID '$DatasetId'"

                    # Cross-populate workspace ID cache to avoid a redundant API call
                    # when callers subsequently resolve the workspace name
                    if ($dataset.workspaceId) {
                        $workspaceIdCacheKey = "DatasetWorkspaceId_$DatasetId"
                        Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$workspaceIdCacheKey" -Value $dataset.workspaceId
                        Write-PSFMessage -Level Debug -Message "Cached workspace ID '$($dataset.workspaceId)' for dataset ID '$DatasetId' (cross-populated)"
                    }
                }

                return $name
            }

            # Dataset not found, cache fallback to prevent repeated API calls
            Write-PSFMessage -Level Verbose -Message "Dataset with ID '$DatasetId' not found. Returning ID as fallback."
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $DatasetId
                Write-PSFMessage -Level Debug -Message "Cached fallback for dataset ID '$DatasetId' (not found)"
            }
            return $DatasetId
        }
        catch {
            # Error occurred, log and return ID as fallback
            Write-PSFMessage -Level Verbose -Message "Failed to resolve dataset ID '$DatasetId': $($_.Exception.Message)"
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $DatasetId
                Write-PSFMessage -Level Debug -Message "Cached fallback for dataset ID '$DatasetId' (error)"
            }
            return $DatasetId
        }
    }
}
