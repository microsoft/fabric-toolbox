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

.PARAMETER Raw
When specified, returns the raw API response without any filtering or formatting.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId -KQLDatabaseId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the database whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId -KQLDatabaseName 'Telemetry'

Returns the single database named 'Telemetry' if it exists.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId

Returns all databases in the specified workspace.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId -Raw

Returns the raw API response for all databases in the workspace without any processing.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLDatabaseId or KQLDatabaseName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

#>
function Get-FabricKQLDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($KQLDatabaseId -and $KQLDatabaseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'KQLDatabaseId' or 'KQLDatabaseName'." -Level Error
                return
            }

            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $KQLDatabaseId -DisplayName $KQLDatabaseName -ResourceType 'KQLDatabase' -TypeName 'MicrosoftFabric.KQLDatabase' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve KQLDatabase for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
