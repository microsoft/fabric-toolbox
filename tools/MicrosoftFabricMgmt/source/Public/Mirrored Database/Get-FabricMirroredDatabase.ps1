<#
.SYNOPSIS
Gets a Mirrored Database or lists all Mirrored Databases in a workspace.

.DESCRIPTION
The Get-FabricMirroredDatabase cmdlet retrieves Mirrored Database items from a specified Microsoft Fabric workspace.
You can return all mirrored databases in the workspace, or filter the results by an exact display name or a specific item Id.
Only one of MirroredDatabaseId or MirroredDatabaseName can be provided at a time.

.PARAMETER WorkspaceId
The GUID of the workspace to query for mirrored databases. This identifies the scope of the request and is required
for every call so the API can resolve which workspace’s mirrored resources to enumerate.

.PARAMETER MirroredDatabaseId
When supplied, returns only the mirrored database that matches the provided resource Id. Use this when you already
know the item’s Id and want to avoid an additional client-side name filter across all items.

.PARAMETER MirroredDatabaseName
When supplied, returns only the mirrored database whose display name exactly matches this value. This is useful when
you don’t have the Id available. Do not use with MirroredDatabaseId; only one filter may be specified.

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

Returns the single mirrored database with the specified Id from the workspace.

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseName "Development"

Retrieves the mirrored database named "Development" from workspace "12345".

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345"

Lists all mirrored databases available in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricMirroredDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredDatabaseName
    )
    try {
        # Validate input parameters
        if ($MirroredDatabaseId -and $MirroredDatabaseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'MirroredDatabaseId' or 'MirroredDatabaseName'." -Level Error
            return $null
        }

        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MirroredDatabaseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MirroredDatabaseId }, 'First')
        }
        elseif ($MirroredDatabaseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MirroredDatabaseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Mirrored Database. Error: $errorDetails" -Level Error
    }

}
