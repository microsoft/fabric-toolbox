<#
.SYNOPSIS
    Constructs a properly formatted Fabric API endpoint URI.

.DESCRIPTION
    This helper function standardizes URI construction across all 244 public functions.
    It handles workspace IDs, item IDs, subresources, and query parameters consistently.

.PARAMETER Resource
    The base resource type (e.g., 'workspaces', 'capacities', 'items').

.PARAMETER WorkspaceId
    Optional GUID for the primary resource id that follows -Resource in the path
    (e.g. the workspace id in /workspaces/{id}, or a connection id in
    /connections/{id}). Aliased as -ResourceId for non-workspace resources.

.PARAMETER ItemId
    Optional leaf item GUID. If provided, it is placed LAST in the path (after any
    -Subresource), e.g. /workspaces/{workspaceId}/items/{itemId} or
    /connections/{connectionId}/roleAssignments/{itemId}.

.PARAMETER Subresource
    Optional subresource path (e.g., 'users', 'roleAssignments', 'definition').

.PARAMETER Segments
    Explicit ordered list of path segments to append after the base URL, e.g.
    @('workspaces', $workspaceId, 'notebooks', $itemId, 'getDefinition'). Use this when
    the path does not fit the Resource/WorkspaceId/Subresource/ItemId shape. Mutually
    exclusive with -Resource. Null/empty segments are skipped.

.PARAMETER QueryParameters
    Optional hashtable of query parameters to append to the URI.

.OUTPUTS
    System.String
    Returns the fully constructed API endpoint URI.

.EXAMPLE
    New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -Subresource 'lakehouses'

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}/lakehouses

.EXAMPLE
    New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -Subresource 'items' -ItemId $itemId

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}/items/{itemId}

.EXAMPLE
    $query = @{ updateMetadata = 'true'; force = 'false' }
    New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -QueryParameters $query

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}?updateMetadata=true&force=false

.NOTES
    Uses PSFramework configuration for the base URL.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function New-FabricAPIUri {
    [CmdletBinding(DefaultParameterSetName = 'Parts')]
    [OutputType([string])]
    [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '', Justification = 'Pure URI string builder; does not change system state despite the New verb.')]
    param(
        [Parameter(Mandatory = $true, ParameterSetName = 'Parts')]
        [ValidateNotNullOrEmpty()]
        [string]$Resource,

        [Parameter(ParameterSetName = 'Parts')]
        [Alias('ResourceId')]
        [string]$WorkspaceId,

        [Parameter(ParameterSetName = 'Parts')]
        [string]$ItemId,

        [Parameter(ParameterSetName = 'Parts')]
        [string]$Subresource,

        [Parameter(Mandatory = $true, ParameterSetName = 'Segments')]
        [ValidateNotNullOrEmpty()]
        [string[]]$Segments,

        [Parameter()]
        [hashtable]$QueryParameters
    )

    # Get base URL from module-scoped auth context
    $baseUrl = $script:FabricAuthContext.BaseUrl

    # Start building the URI
    $uriParts = [System.Collections.Generic.List[string]]::new()
    $uriParts.Add($baseUrl)

    if ($PSCmdlet.ParameterSetName -eq 'Segments') {
        # Explicit path segments (skip null/empty so callers can pass optional parts).
        foreach ($seg in $Segments) {
            if (-not [string]::IsNullOrEmpty($seg)) { $uriParts.Add($seg) }
        }
    }
    else {
        $uriParts.Add($Resource)

        # Add workspace ID if provided
        if ($WorkspaceId) {
            $uriParts.Add($WorkspaceId)
        }

        # Add subresource if provided
        if ($Subresource) {
            $uriParts.Add($Subresource)
        }

        # Add item ID if provided (typically comes after subresource)
        if ($ItemId) {
            $uriParts.Add($ItemId)
        }
    }

    # Join parts with forward slashes
    $uri = $uriParts -join '/'

    # Add query parameters if provided
    if ($QueryParameters -and $QueryParameters.Count -gt 0) {
        $queryString = ($QueryParameters.GetEnumerator() | ForEach-Object {
            $key = [System.Uri]::EscapeDataString($_.Key)
            $value = [System.Uri]::EscapeDataString($_.Value.ToString())
            "$key=$value"
        }) -join '&'

        $uri = "$uri`?$queryString"
    }

    Write-FabricLog -Message "Constructed API URI: $uri" -Level Debug
    return $uri
}
