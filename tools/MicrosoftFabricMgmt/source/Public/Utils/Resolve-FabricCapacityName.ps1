function Resolve-FabricCapacityName {
    <#
    .SYNOPSIS
        Resolves a Fabric Capacity ID to its display name.

    .DESCRIPTION
        Looks up the capacity display name from a capacity ID (GUID).
        Results are cached using PSFramework's result cache for performance.

        The cache persists for the session lifetime and is shared across all
        functions. Use Clear-PSFResultCache to clear the cache if needed.

    .PARAMETER CapacityId
        The capacity ID (GUID) to resolve.

    .PARAMETER DisableCache
        If specified, bypasses the cache and always makes a fresh API call.

    .EXAMPLE
        Resolve-FabricCapacityName -CapacityId "12345-abcd-efgh"

        Returns the display name for the specified capacity, using cache if available.

    .EXAMPLE
        Resolve-FabricCapacityName -CapacityId "12345-abcd-efgh" -DisableCache

        Forces a fresh API call, bypassing the cache.

    .NOTES
        This function uses PSFramework's result cache system for optimal performance.
        Cache key format: "CapacityName_{CapacityId}"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [Alias('Id')]
        [string]$CapacityId,

        [Parameter()]
        [switch]$DisableCache
    )

    process {
        # Generate cache key
        $cacheKey = "CapacityName_$CapacityId"

        # Check cache first (unless disabled)
        if (-not $DisableCache) {
            $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Fallback $null

            if ($cached) {
                Write-PSFMessage -Level Debug -Message "Cache hit for capacity ID '$CapacityId': $cached"
                return $cached
            }
        }

        # Cache miss or disabled - make API call
        Write-PSFMessage -Level Debug -Message "Cache miss for capacity ID '$CapacityId' - resolving via API"

        try {
            # Call Get-FabricCapacity to resolve
            $capacity = Get-FabricCapacity -CapacityId $CapacityId -ErrorAction Stop

            if ($capacity -and $capacity.displayName) {
                $name = $capacity.displayName

                # Cache the result (unless caching is disabled)
                if (-not $DisableCache) {
                    Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $name
                    Write-PSFMessage -Level Debug -Message "Cached capacity name '$name' for ID '$CapacityId'"
                }

                return $name
            }

            # Capacity not found, return ID as fallback
            Write-PSFMessage -Level Warning -Message "Capacity with ID '$CapacityId' not found. Returning ID as fallback."
            return $CapacityId
        }
        catch {
            # Error occurred, log and return ID as fallback
            Write-PSFMessage -Level Warning -Message "Failed to resolve capacity ID '$CapacityId': $($_.Exception.Message)" -ErrorRecord $_
            return $CapacityId
        }
    }
}
