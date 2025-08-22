<#
.SYNOPSIS
Retrieve the topology for an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamTopology sends a GET request to the Fabric API to obtain the topology for a specified Eventstream within a workspace. The function validates the authentication token before making the API call and returns the topology object or $null if no data is returned.

.PARAMETER WorkspaceId
The workspace ID that contains the Eventstream. (Required)

.PARAMETER EventstreamId
The Eventstream ID whose topology will be retrieved. (Required)

.EXAMPLE
Get-FabricEventstreamTopology -WorkspaceId "12345" -EventstreamId "67890"
Retrieves the topology for eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token prior to the API request.
Author: Tiago Balabuch
#>

function Get-FabricEventstreamTopology {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/topology" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
   
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Eventstream Topology. Error: $errorDetails" -Level Error
    } 
}