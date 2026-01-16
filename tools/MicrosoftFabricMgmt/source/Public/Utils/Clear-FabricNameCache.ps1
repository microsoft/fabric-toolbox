function Clear-FabricNameCache {
    <#
    .SYNOPSIS
        Clears the cached capacity and workspace name resolutions.

    .DESCRIPTION
        Removes all cached capacity and workspace name lookups from PSFramework's
        configuration cache. Use this if capacity or workspace names have changed
        and you need to force fresh API lookups.

        This function clears:
        - All cached capacity names (from Resolve-FabricCapacityName)
        - All cached workspace names (from Resolve-FabricWorkspaceName)

    .PARAMETER Force
        If specified, clears the cache without confirmation.

    .EXAMPLE
        Clear-FabricNameCache

        Clears all cached capacity and workspace names.

    .EXAMPLE
        Clear-FabricNameCache -Force

        Clears the cache without prompting for confirmation.

    .NOTES
        This function is useful when:
        - Capacity or workspace names have been renamed
        - You suspect cached data is stale
        - You want to reduce memory usage from large caches
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Low')]
    param(
        [Parameter()]
        [switch]$Force
    )

    begin {
        Write-PSFMessage -Level Verbose -Message "Preparing to clear Fabric name cache"
    }

    process {
        if ($Force -or $PSCmdlet.ShouldProcess("Fabric Name Cache", "Clear all cached capacity and workspace names")) {
            try {
                # Get all PSFramework configuration items for our cache
                $cacheConfigs = Get-PSFConfig -FullName "MicrosoftFabricMgmt.Cache.*"

                if ($cacheConfigs) {
                    $count = ($cacheConfigs | Measure-Object).Count

                    # Remove each cached configuration by setting to $null and unregistering
                    foreach ($config in $cacheConfigs) {
                        # First set the value to $null to clear runtime cache
                        Set-PSFConfig -FullName $config.FullName -Value $null

                        # Then unregister to remove from persisted storage
                        Unregister-PSFConfig -FullName $config.FullName -Scope FileUserShared -ErrorAction SilentlyContinue
                        Unregister-PSFConfig -FullName $config.FullName -Scope FileSystem -ErrorAction SilentlyContinue
                    }

                    Write-PSFMessage -Level Host -Message "Successfully cleared $count cached name resolution(s)"
                }
                else {
                    Write-PSFMessage -Level Host -Message "No cached names found to clear"
                }
            }
            catch {
                Write-PSFMessage -Level Error -Message "Failed to clear name cache: $($_.Exception.Message)" -ErrorRecord $_
                throw
            }
        }
    }
}
