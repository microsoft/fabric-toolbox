<#
.SYNOPSIS
    Constructs a properly formatted Fabric API endpoint URI.

.DESCRIPTION
    This helper function standardizes URI construction across all 244 public functions.
    It handles workspace IDs, item IDs, subresources, and query parameters consistently.

.PARAMETER Resource
    The base resource type (e.g., 'workspaces', 'capacities', 'items').

.PARAMETER WorkspaceId
    Optional workspace GUID. If provided, will be included in the URI path.

.PARAMETER ItemId
    Optional item GUID. If provided, will be included in the URI path after workspace.

.PARAMETER Subresource
    Optional subresource path (e.g., 'users', 'roleAssignments', 'definition').

.PARAMETER QueryParameters
    Optional hashtable of query parameters to append to the URI.

.OUTPUTS
    System.String
    Returns the fully constructed API endpoint URI.

.EXAMPLE
    Build-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -Subresource 'lakehouses'

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}/lakehouses

.EXAMPLE
    Build-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -Subresource 'items' -ItemId $itemId

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}/items/{itemId}

.EXAMPLE
    $query = @{ updateMetadata = 'true'; force = 'false' }
    Build-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -QueryParameters $query

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}?updateMetadata=true&force=false

.NOTES
    Uses PSFramework configuration for the base URL.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Build-FabricAPIUri {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Resource,

        [Parameter()]
        [string]$WorkspaceId,

        [Parameter()]
        [string]$ItemId,

        [Parameter()]
        [string]$Subresource,

        [Parameter()]
        [hashtable]$QueryParameters
    )

    # Get base URL from module-scoped auth context
    $baseUrl = $script:FabricAuthContext.BaseUrl

    # Start building the URI
    $uriParts = [System.Collections.Generic.List[string]]::new()
    $uriParts.Add($baseUrl)
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
