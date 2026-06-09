function Resolve-FabricWorkspaceName {
    <#
    .SYNOPSIS
        Resolves a Fabric Workspace ID to its display name.

    .DESCRIPTION
        Looks up the workspace display name from a workspace ID (GUID).
        Results are cached using PSFramework's configuration system for performance.

        The cache persists for the session lifetime and is shared across all
        functions. Use Clear-FabricNameCache to clear the cache if needed.

    .PARAMETER WorkspaceId
        The workspace ID (GUID) to resolve.

    .PARAMETER DisableCache
        If specified, bypasses the cache and always makes a fresh API call.

    .EXAMPLE
        Resolve-FabricWorkspaceName -WorkspaceId "67890-ijkl-mnop"

        Returns the display name for the specified workspace, using cache if available.

    .EXAMPLE
        Resolve-FabricWorkspaceName -WorkspaceId "67890-ijkl-mnop" -DisableCache

        Forces a fresh API call, bypassing the cache.

    .NOTES
        This function uses PSFramework's configuration system for caching.
        Cache key format: "WorkspaceName_{WorkspaceId}"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [Alias('Id')]
        [string]$WorkspaceId,

        [Parameter()]
        [switch]$DisableCache
    )

    process {
        # Generate cache key
        $cacheKey = "WorkspaceName_$WorkspaceId"

        # Check cache first (unless disabled)
        if (-not $DisableCache) {
            $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Fallback $null

            if ($cached) {
                Write-PSFMessage -Level Debug -Message "Cache hit for workspace ID '$WorkspaceId': $cached"
                return $cached
            }
        }

        # Cache miss or disabled - make API call
        Write-PSFMessage -Level Debug -Message "Cache miss for workspace ID '$WorkspaceId' - resolving via API"

        try {
            # Call Get-FabricWorkspace to resolve
            $workspace = Get-FabricWorkspace -WorkspaceId $WorkspaceId -ErrorAction Stop

            if ($workspace -and $workspace.displayName) {
                $name = $workspace.displayName

                # Cache the result (unless caching is disabled)
                if (-not $DisableCache) {
                    Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $name
                    Write-PSFMessage -Level Debug -Message "Cached workspace name '$name' for ID '$WorkspaceId'"

                    # Cross-populate capacity ID cache to avoid a redundant API call from Resolve-FabricCapacityIdFromWorkspace
                    if ($workspace.capacityId) {
                        $capacityIdCacheKey = "WorkspaceCapacityId_$WorkspaceId"
                        Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$capacityIdCacheKey" -Value $workspace.capacityId
                        Write-PSFMessage -Level Debug -Message "Cached capacity ID '$($workspace.capacityId)' for workspace ID '$WorkspaceId' (cross-populated)"
                    }
                }

                return $name
            }

            # Workspace not found, cache fallback to prevent repeated API calls
            Write-PSFMessage -Level Verbose -Message "Workspace with ID '$WorkspaceId' not found. Returning ID as fallback."
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $WorkspaceId
                Write-PSFMessage -Level Debug -Message "Cached fallback for workspace ID '$WorkspaceId' (not found)"
            }
            return $WorkspaceId
        }
        catch {
            # Error occurred, log and return ID as fallback
            Write-PSFMessage -Level Verbose -Message "Failed to resolve workspace ID '$WorkspaceId': $($_.Exception.Message)"
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $WorkspaceId
                Write-PSFMessage -Level Debug -Message "Cached fallback for workspace ID '$WorkspaceId' (error)"
            }
            return $WorkspaceId
        }
    }
}
