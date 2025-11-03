<#
.SYNOPSIS
Retrieves connection details for a specific Eventstream source in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamSourceConnection sends a GET request to the Fabric management API to fetch the connection information
for a specified Eventstream source. All three identifiers (WorkspaceId, EventstreamId, SourceId) are required to locate the resource.

.PARAMETER WorkspaceId
The workspace identifier that contains the Eventstream. (Mandatory)

.PARAMETER EventstreamId
The identifier of the Eventstream that contains the source. (Mandatory)

.PARAMETER SourceId
The identifier of the source whose connection details will be retrieved. (Mandatory)

.OUTPUTS
System.Object
Returns the API response as a PowerShell object (commonly a hashtable or PSCustomObject) representing the source connection.

.EXAMPLE
Get-FabricEventstreamSourceConnection -WorkspaceId '12345' -EventstreamId '67890' -SourceId 'abcd'
Retrieves connection details for source 'abcd' of Eventstream '67890' in workspace '12345'.

.NOTES
- Requires a global $FabricConfig variable containing BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before issuing the request.
- Author: Tiago Balabuch
#>

function Get-FabricEventstreamSourceConnection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SourceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/sources/{3}/connection" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $SourceId
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
        Write-Message -Message "Failed to retrieve Eventstream Source Connection. Error: $errorDetails" -Level Error
    }
}