<#
.SYNOPSIS
Gets per-table mirroring status details for a mirrored database.

.DESCRIPTION
The Get-FabricMirroredDatabaseTableStatus cmdlet returns the table-level mirroring status for the specified mirrored
database. Use this command to identify which tables are healthy, delayed, or failing replication so you can target
remediation efforts precisely.

.PARAMETER WorkspaceId
The GUID of the workspace that contains the mirrored database. This is required to scope the API request.

.PARAMETER MirroredDatabaseId
The Id of the mirrored database whose table-level status you want to inspect. Provide the resource Id to retrieve the
status collection for all mirrored tables.

.EXAMPLE
Get-FabricMirroredDatabaseTableStatus -WorkspaceId 11111111-2222-3333-4444-555555555555 -MirroredDatabaseId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Returns a list of table status objects showing replication health, last sync times, or lag metrics (when exposed).

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricMirroredDatabaseTableStatus {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/getTablesMirroringStatus" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $MirroredDatabaseId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Post'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "Item(s) found. Data retrieved successfully!" -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
