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
you don't have the Id available. Do not use with MirroredDatabaseId; only one filter may be specified.

.PARAMETER Raw
If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

Returns the single mirrored database with the specified Id from the workspace.

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseName "Development"

Retrieves the mirrored database named "Development" from workspace "12345".

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345"

Lists all mirrored databases available in workspace "12345".

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -Raw

Retrieves all mirrored databases in the workspace with raw API response format.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricMirroredDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredDatabaseName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($MirroredDatabaseId -and $MirroredDatabaseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'MirroredDatabaseId' or 'MirroredDatabaseName'." -Level Error
                return
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

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $MirroredDatabaseId -DisplayName $MirroredDatabaseName -ResourceType 'MirroredDatabase' -TypeName 'MicrosoftFabric.MirroredDatabase' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve MirroredDatabase for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
