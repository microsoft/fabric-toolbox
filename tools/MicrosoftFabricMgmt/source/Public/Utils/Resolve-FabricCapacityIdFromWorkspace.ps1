function Resolve-FabricCapacityIdFromWorkspace {
    <#
    .SYNOPSIS
        Resolves a Capacity ID from a Workspace ID.

    .DESCRIPTION
        Looks up the workspace to get its capacity ID.
        This is needed for items (like Lakehouses) that only have workspaceId but not capacityId.
        Results are cached using PSFramework's configuration system for performance.

    .PARAMETER WorkspaceId
        The workspace ID (GUID) to resolve.

    .PARAMETER DisableCache
        If specified, bypasses the cache and always makes a fresh API call.

    .EXAMPLE
        Resolve-FabricCapacityIdFromWorkspace -WorkspaceId "67890-ijkl-mnop"

        Returns the capacity ID for the workspace, using cache if available.

    .NOTES
        This function uses PSFramework's configuration system for caching.
        Cache key format: "WorkspaceCapacityId_{WorkspaceId}"
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
        $cacheKey = "WorkspaceCapacityId_$WorkspaceId"

        # Check cache first (unless disabled)
        if (-not $DisableCache) {
            $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Fallback $null

            if ($cached) {
                if ($cached -eq '__NONE__') {
                    Write-PSFMessage -Level Debug -Message "Cache hit (no capacity assigned) for workspace ID '$WorkspaceId'"
                    return $null
                }
                Write-PSFMessage -Level Debug -Message "Cache hit for workspace capacity ID '$WorkspaceId': $cached"
                return $cached
            }
        }

        # Cache miss or disabled - make API call
        Write-PSFMessage -Level Debug -Message "Cache miss for workspace capacity ID '$WorkspaceId' - resolving via API"

        try {
            # Call Get-FabricWorkspace to resolve
            $workspace = Get-FabricWorkspace -WorkspaceId $WorkspaceId -ErrorAction Stop

            if ($workspace -and $workspace.capacityId) {
                $capacityId = $workspace.capacityId

                # Cache the result (unless caching is disabled)
                if (-not $DisableCache) {
                    Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $capacityId
                    Write-PSFMessage -Level Debug -Message "Cached capacity ID '$capacityId' for workspace ID '$WorkspaceId'"

                    # Cross-populate workspace name cache to avoid a redundant API call from Resolve-FabricWorkspaceName
                    if ($workspace.displayName) {
                        $workspaceNameCacheKey = "WorkspaceName_$WorkspaceId"
                        Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$workspaceNameCacheKey" -Value $workspace.displayName
                        Write-PSFMessage -Level Debug -Message "Cached workspace name '$($workspace.displayName)' for workspace ID '$WorkspaceId' (cross-populated)"
                    }
                }

                return $capacityId
            }

            # Workspace found but no capacityId - cache sentinel to prevent repeated API calls
            Write-PSFMessage -Level Verbose -Message "Workspace '$WorkspaceId' has no capacity assigned"
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value '__NONE__'
                Write-PSFMessage -Level Debug -Message "Cached 'no capacity' sentinel for workspace ID '$WorkspaceId'"
            }
            return $null
        }
        catch {
            # Error occurred, log and return null
            Write-PSFMessage -Level Verbose -Message "Failed to resolve capacity ID from workspace ID '$WorkspaceId': $($_.Exception.Message)"
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value '__NONE__'
                Write-PSFMessage -Level Debug -Message "Cached 'no capacity' sentinel for workspace ID '$WorkspaceId' (error)"
            }
            return $null
        }
    }
}
