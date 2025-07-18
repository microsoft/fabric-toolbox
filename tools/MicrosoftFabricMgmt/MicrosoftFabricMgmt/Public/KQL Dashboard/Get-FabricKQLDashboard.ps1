<#
.SYNOPSIS
Retrieves an KQLDashboard or a list of KQLDashboards from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricKQLDashboard` function sends a GET request to the Fabric API to retrieve KQLDashboard details for a given workspace. It can filter the results by `KQLDashboardName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query KQLDashboards.

.PARAMETER KQLDashboardName
(Optional) The name of the specific KQLDashboard to retrieve.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId "12345" -KQLDashboardName "Development"

Retrieves the "Development" KQLDashboard from workspace "12345".

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId "12345"

Retrieves all KQLDashboards in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

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
            Write-Message -Message "Specify only one parameter: either 'KQLDashboardId' or 'KQLDashboardName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($KQLDashboardId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLDashboardId }, 'First')
        }
        elseif ($KQLDashboardName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLDashboardName }, 'First')
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
        Write-Message -Message "Failed to retrieve KQLDashboard. Error: $errorDetails" -Level Error
    } 
 
}
