<#
.SYNOPSIS
Retrieves a specific KQL Database or all KQL Databases from a workspace.

.DESCRIPTION
Calls the Fabric API to list KQL Databases in the target workspace. You can filter by either the database GUID (KQLDatabaseId) or the display name (KQLDatabaseName). If neither filter is provided all databases are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace containing the KQL Databases.

.PARAMETER KQLDatabaseId
Optional. The GUID of a single KQL Database to retrieve directly. Use this when you already know its identifier.

.PARAMETER KQLDatabaseName
Optional. The display name of a KQL Database to retrieve. Provide this when the Id is unknown and you want to match by name.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId -KQLDatabaseId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the database whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId -KQLDatabaseName 'Telemetry'

Returns the single database named 'Telemetry' if it exists.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId

Returns all databases in the specified workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLDatabaseId or KQLDatabaseName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

#>
function Get-FabricKQLDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName
    )
    try {
        # Validate input parameters
        if ($KQLDatabaseId -and $KQLDatabaseName) {
            Write-Message -Message "Specify only one parameter: either 'KQLDatabaseId' or 'KQLDatabaseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($KQLDatabaseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLDatabaseId }, 'First')
        }
        elseif ($KQLDatabaseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLDatabaseName }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve KQLDatabase. Error: $errorDetails" -Level Error
    }

}
