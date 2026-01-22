<#
.SYNOPSIS
    Filters Fabric API resources by ID, DisplayName, or returns all items.

.DESCRIPTION
    This helper function eliminates duplicate filtering logic across all Get-* functions.
    It handles mutual exclusivity of ID vs DisplayName filtering and provides consistent
    warning messages when resources are not found.

.PARAMETER InputObject
    The collection of resources to filter (typically from an API response).

.PARAMETER Id
    Optional resource ID (GUID) to filter by. Mutually exclusive with DisplayName.

.PARAMETER DisplayName
    Optional display name to filter by. Mutually exclusive with Id.

.PARAMETER ResourceType
    The type of resource being filtered (e.g., 'Lakehouse', 'Workspace').
    Used for consistent warning messages.

.PARAMETER TypeName
    Optional PSTypeName to add to returned objects for custom formatting.
    Example: 'MicrosoftFabric.Workspace', 'MicrosoftFabric.Lakehouse'

.OUTPUTS
    System.Object[]
    Returns filtered resources or all resources if no filter is specified.

.EXAMPLE
    Select-FabricResource -InputObject $items -Id $lakehouseId -ResourceType 'Lakehouse'

    Returns the lakehouse with the specified ID, or shows a warning if not found.

.EXAMPLE
    Select-FabricResource -InputObject $items -DisplayName 'MyLakehouse' -ResourceType 'Lakehouse'

    Returns lakehouse(s) matching the display name, or shows a warning if not found.

.EXAMPLE
    Select-FabricResource -InputObject $items -ResourceType 'Lakehouse'

    Returns all lakehouses (no filtering).

.NOTES
    This function saves approximately 20 lines per Get-* function × ~50 functions = ~1,000 lines.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Select-FabricResource {
    [CmdletBinding()]
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$InputObject,

        [Parameter()]
        [string]$Id,

        [Parameter()]
        [Alias('Name')]
        [string]$DisplayName,

        [Parameter(Mandatory = $true)]
        [string]$ResourceType,

        [Parameter()]
        [string]$TypeName
    )

    # If no input, return empty
    if (-not $InputObject -or $InputObject.Count -eq 0) {
        Write-FabricLog -Message "No $ResourceType resources found in input" -Level Debug
        return @()
    }

    # No filters - return all
    if (-not $Id -and -not $DisplayName) {
        Write-FabricLog -Message "Returning all $($InputObject.Count) $ResourceType resource(s)" -Level Debug

        # Add type decoration if specified
        if ($TypeName) {
            $InputObject | Add-FabricTypeName -TypeName $TypeName
        }

        return $InputObject
    }

    # Filter by ID
    if ($Id) {
        Write-FabricLog -Message "Filtering $ResourceType by ID: $Id" -Level Debug

        $filtered = $InputObject | Where-Object { $_.id -eq $Id }

        if (-not $filtered) {
            Write-FabricLog -Message "$ResourceType with ID '$Id' not found" -Level Warning
        } else {
            Write-FabricLog -Message "Found $ResourceType with ID: $Id" -Level Debug

            # Add type decoration if specified
            if ($TypeName) {
                $filtered | Add-FabricTypeName -TypeName $TypeName
            }
        }

        return $filtered
    }

    # Filter by DisplayName
    if ($DisplayName) {
        Write-FabricLog -Message "Filtering $ResourceType by DisplayName: $DisplayName" -Level Debug

        $filtered = $InputObject | Where-Object { $_.displayName -eq $DisplayName }

        if (-not $filtered) {
            Write-FabricLog -Message "$ResourceType with DisplayName '$DisplayName' not found" -Level Warning
        } else {
            Write-FabricLog -Message "Found $($filtered.Count) $ResourceType resource(s) with DisplayName: $DisplayName" -Level Debug

            # Add type decoration if specified
            if ($TypeName) {
                $filtered | Add-FabricTypeName -TypeName $TypeName
            }
        }

        return $filtered
    }

    # Fallback (should not reach here)
    if ($TypeName) {
        $InputObject | Add-FabricTypeName -TypeName $TypeName
    }
    return $InputObject
}
