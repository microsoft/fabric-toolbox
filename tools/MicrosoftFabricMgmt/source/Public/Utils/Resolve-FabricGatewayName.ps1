function Resolve-FabricGatewayName {
    <#
    .SYNOPSIS
        Resolves a Power BI Gateway ID to its display name.

    .DESCRIPTION
        Looks up the gateway display name from a gateway ID (GUID).
        Results are cached using PSFramework's configuration system for performance.

        The cache persists for the session lifetime and is shared across all
        functions. Use Clear-FabricNameCache to clear the cache if needed.

    .PARAMETER GatewayId
        The gateway ID (GUID) to resolve.

    .PARAMETER DisableCache
        If specified, bypasses the cache and always makes a fresh API call.

    .EXAMPLE
        Resolve-FabricGatewayName -GatewayId "12345-abcd-efgh"

        Returns the display name for the specified gateway, using cache if available.

    .EXAMPLE
        Resolve-FabricGatewayName -GatewayId "12345-abcd-efgh" -DisableCache

        Forces a fresh API call, bypassing the cache.

    .NOTES
        This function uses PSFramework's configuration system for caching.
        Cache key format: "GatewayName_{GatewayId}"
        Requires gateway admin permissions (Dataset.ReadWrite.All or Dataset.Read.All scope).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [ValidateNotNullOrEmpty()]
        [Alias('Id')]
        [string]$GatewayId,

        [Parameter()]
        [switch]$DisableCache
    )

    process {
        # Generate cache key
        $cacheKey = "GatewayName_$GatewayId"

        # Check cache first (unless disabled)
        if (-not $DisableCache) {
            $cached = Get-PSFConfigValue -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Fallback $null

            if ($cached) {
                Write-PSFMessage -Level Debug -Message "Cache hit for gateway ID '$GatewayId': $cached"
                return $cached
            }
        }

        # Cache miss or disabled - make API call
        Write-PSFMessage -Level Debug -Message "Cache miss for gateway ID '$GatewayId' - resolving via API"

        try {
            $gateway = Get-FabricAdminGateway -GatewayId $GatewayId -ErrorAction Stop

            if ($gateway -and $gateway.name) {
                $name = $gateway.name

                # Cache the result (unless caching is disabled)
                if (-not $DisableCache) {
                    Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $name
                    Write-PSFMessage -Level Debug -Message "Cached gateway name '$name' for ID '$GatewayId'"
                }

                return $name
            }

            # Gateway not found, cache fallback to prevent repeated API calls
            Write-PSFMessage -Level Verbose -Message "Gateway with ID '$GatewayId' not found. Returning ID as fallback."
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $GatewayId
                Write-PSFMessage -Level Debug -Message "Cached fallback for gateway ID '$GatewayId' (not found)"
            }
            return $GatewayId
        }
        catch {
            # Error occurred, log and return ID as fallback
            Write-PSFMessage -Level Verbose -Message "Failed to resolve gateway ID '$GatewayId': $($_.Exception.Message)"
            if (-not $DisableCache) {
                Set-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.$cacheKey" -Value $GatewayId
                Write-PSFMessage -Level Debug -Message "Cached fallback for gateway ID '$GatewayId' (error)"
            }
            return $GatewayId
        }
    }
}
