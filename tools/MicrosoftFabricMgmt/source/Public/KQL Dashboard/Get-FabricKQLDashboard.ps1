<#
.SYNOPSIS
Retrieves a specific KQL Dashboard or all KQL Dashboards from a workspace.

.DESCRIPTION
Calls the Fabric API to list KQL Dashboards in the target workspace. You can filter by either the dashboard GUID (KQLDashboardId) or the display name (KQLDashboardName). If neither filter is provided all dashboards are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace containing the KQL Dashboards.

.PARAMETER KQLDashboardId
Optional. The GUID of a single KQL Dashboard to retrieve directly. Use this when you already know its identifier.

.PARAMETER KQLDashboardName
Optional. The display name of a KQL Dashboard to retrieve. Provide this when the Id is unknown and you want to match by name.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId -KQLDashboardId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the dashboard whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId -KQLDashboardName 'Operations Overview'

Returns the single dashboard named 'Operations Overview' if it exists.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId

Returns all dashboards in the specified workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLDashboardId or KQLDashboardName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

#>

function Get-FabricKQLDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDashboardName
    )
    try {
        # Validate input parameters
        if ($KQLDashboardId -and $KQLDashboardName) {
            Write-FabricLog -Message "Specify only one parameter: either 'KQLDashboardId' or 'KQLDashboardName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($KQLDashboardId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLDashboardId }, 'First')
        }
        elseif ($KQLDashboardName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLDashboardName }, 'First')
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
        Write-FabricLog -Message "Failed to retrieve KQLDashboard. Error: $errorDetails" -Level Error
    }

}
