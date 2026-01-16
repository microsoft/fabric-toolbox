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
                }

                return $capacityId
            }

            # Workspace found but no capacityId
            Write-PSFMessage -Level Debug -Message "Workspace '$WorkspaceId' has no capacity assigned"
            return $null
        }
        catch {
            # Error occurred, log and return null
            Write-PSFMessage -Level Warning -Message "Failed to resolve capacity ID from workspace ID '$WorkspaceId': $($_.Exception.Message)" -ErrorRecord $_
            return $null
        }
    }
}
