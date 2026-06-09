<#
.SYNOPSIS
Retrieves a specific KQL Queryset or all KQL Querysets from a workspace.

.DESCRIPTION
Calls the Fabric API to list KQL Querysets in the target workspace. You can filter by either the queryset GUID (KQLQuerysetId) or the display name (KQLQuerysetName). If neither filter is provided all querysets are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace containing the KQL Querysets.

.PARAMETER KQLQuerysetId
Optional. The GUID of a single KQL Queryset to retrieve directly. Use this for direct lookup when you know the identifier.

.PARAMETER KQLQuerysetName
Optional. The display name of a KQL Queryset to retrieve. Provide this when the Id is unknown and you want to match by name.

.PARAMETER Raw
When specified, returns the raw API response without any filtering or formatting.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId $wId -KQLQuerysetId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the queryset whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId $wId -KQLQuerysetName 'User Activity'

Returns the single queryset named 'User Activity' if it exists.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId $wId

Returns all querysets in the specified workspace.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId $wId -Raw

Returns the raw API response for all querysets in the workspace without any processing.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLQuerysetId or KQLQuerysetName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

#>
function Get-FabricKQLQueryset {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLQuerysetName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($KQLQuerysetId -and $KQLQuerysetName) {
                Write-FabricLog -Message "Specify only one parameter: either 'KQLQuerysetId' or 'KQLQuerysetName'." -Level Error
                return
            }

            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $KQLQuerysetId -DisplayName $KQLQuerysetName -ResourceType 'KQLQueryset' -TypeName 'MicrosoftFabric.KQLQueryset' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve KQLQueryset for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }

}
