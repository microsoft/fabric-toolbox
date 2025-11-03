
<#
.SYNOPSIS
Retrieves the definition of a KQLDashboard from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the KQLDashboard's content or metadata from a workspace. 
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the KQLDashboard definition is to be retrieved.

.PARAMETER KQLDashboardId
(Optional)The unique identifier of the KQLDashboard whose definition needs to be retrieved.

.PARAMETER KQLDashboardFormat
Specifies the format of the KQLDashboard definition.

.EXAMPLE
Get-FabricKQLDashboardDefinition -WorkspaceId "12345" -KQLDashboardId "67890"

Retrieves the definition of the KQLDashboard with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricKQLDashboardDefinition -WorkspaceId "12345"

Retrieves the definitions of all KQLDashboards in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

#>
function Get-FabricKQLDashboardDefinition {
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
        [string]$KQLDashboardFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic    
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        if ($KQLDashboardFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $KQLDashboardFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
   
        # Return the API response
        Write-Message -Message "KQLDashboard '$KQLDashboardId' definition retrieved successfully!" -Level Info
        return $response   
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve KQLDashboard. Error: $errorDetails" -Level Error
    } 
 
}
