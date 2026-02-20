<#
.SYNOPSIS
    Filters Fabric API resources by ID, DisplayName, or returns all items.

.DESCRIPTION
    This helper function eliminates duplicate filtering logic across all Get-* functions.
    It handles mutual exclusivity of ID vs DisplayName filtering and provides consistent
    warning messages when resources are not found.

    By default, returned objects are decorated with PSTypeNames for custom formatting
    (showing Capacity Name, Workspace Name, etc. in table view). Use the -Raw switch
    to instead add resolved name properties directly to the objects for export scenarios.

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
    Ignored when -Raw is specified.

.PARAMETER Raw
    When specified, adds resolved name properties (CapacityName, WorkspaceName) directly
    to the output objects instead of using PSTypeName formatting. This is useful when
    piping to Export-Csv, ConvertTo-Json, or other commands that need the resolved
    names as actual properties rather than display-only formatting.

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

.EXAMPLE
    Select-FabricResource -InputObject $items -ResourceType 'Lakehouse' -TypeName 'MicrosoftFabric.Lakehouse' -Raw

    Returns all lakehouses with CapacityName and WorkspaceName properties added directly
    to each object, suitable for export to CSV or JSON.

.NOTES
    This function saves approximately 20 lines per Get-* function × ~50 functions = ~1,000 lines.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.1.0
    Last Updated: 2026-01-19
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
        [string]$TypeName,

        [Parameter()]
        [switch]$Raw
    )

    # If no input, return empty
    if (-not $InputObject -or $InputObject.Count -eq 0) {
        Write-FabricLog -Message "No $ResourceType resources found in input" -Level Debug
        return @()
    }

    # Determine which items to return based on filters
    $resultItems = $null

    # No filters - return all
    if (-not $Id -and -not $DisplayName) {
        Write-FabricLog -Message "Returning all $($InputObject.Count) $ResourceType resource(s)" -Level Debug
        $resultItems = $InputObject
    }
    # Filter by ID
    elseif ($Id) {
        Write-FabricLog -Message "Filtering $ResourceType by ID: $Id" -Level Debug
        $resultItems = $InputObject | Where-Object { $_.id -eq $Id }

        if (-not $resultItems) {
            Write-FabricLog -Message "$ResourceType with ID '$Id' not found" -Level Warning
            return $resultItems
        }
        Write-FabricLog -Message "Found $ResourceType with ID: $Id" -Level Debug
    }
    # Filter by DisplayName
    elseif ($DisplayName) {
        Write-FabricLog -Message "Filtering $ResourceType by DisplayName: $DisplayName" -Level Debug
        $resultItems = $InputObject | Where-Object { $_.displayName -eq $DisplayName }

        if (-not $resultItems) {
            Write-FabricLog -Message "$ResourceType with DisplayName '$DisplayName' not found" -Level Warning
            return $resultItems
        }
        Write-FabricLog -Message "Found $(@($resultItems).Count) $ResourceType resource(s) with DisplayName: $DisplayName" -Level Debug
    }

    # Apply Raw or TypeName decoration
    if ($resultItems) {
        if ($Raw) {
            # Add resolved name properties directly to objects
            foreach ($item in $resultItems) {
                # Resolve CapacityName
                $capacityName = $null
                if ($item.capacityId) {
                    try {
                        $capacityName = Resolve-FabricCapacityName -CapacityId $item.capacityId
                    }
                    catch {
                        $capacityName = $item.capacityId
                    }
                }
                elseif ($item.workspaceId) {
                    try {
                        $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $item.workspaceId
                        if ($capacityId) {
                            $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
                        }
                    }
                    catch {
                        $capacityName = $null
                    }
                }

                # Resolve WorkspaceName
                $workspaceName = $null
                if ($item.workspaceId) {
                    try {
                        $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $item.workspaceId
                    }
                    catch {
                        $workspaceName = $item.workspaceId
                    }
                }

                # Add properties to the object
                if ($null -ne $capacityName) {
                    $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
                }
                if ($null -ne $workspaceName) {
                    $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
                }
            }
        }
        elseif ($TypeName) {
            # Add type decoration for formatting
            $resultItems | Add-FabricTypeName -TypeName $TypeName
        }
    }

    return $resultItems
}
