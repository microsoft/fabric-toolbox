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

.PARAMETER Raw
When specified, returns the raw API response without any filtering or formatting.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId -KQLDashboardId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the dashboard whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId -KQLDashboardName 'Operations Overview'

Returns the single dashboard named 'Operations Overview' if it exists.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId

Returns all dashboards in the specified workspace.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId -Raw

Returns the raw API response for all dashboards in the workspace without any processing.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLDashboardId or KQLDashboardName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

#>

function Get-FabricKQLDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDashboardName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($KQLDashboardId -and $KQLDashboardName) {
                Write-FabricLog -Message "Specify only one parameter: either 'KQLDashboardId' or 'KQLDashboardName'." -Level Error
                return
            }

            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'kqlDashboards'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $KQLDashboardId -DisplayName $KQLDashboardName -ResourceType 'KQLDashboard' -TypeName 'MicrosoftFabric.KQLDashboard' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve KQLDashboard for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
