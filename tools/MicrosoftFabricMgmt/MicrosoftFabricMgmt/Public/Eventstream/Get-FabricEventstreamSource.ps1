<#
.SYNOPSIS
Retrieve a specific Eventstream source from a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamSource sends a GET request to the Fabric API to fetch details for a single source belonging to an Eventstream in a workspace. All three identifiers (WorkspaceId, EventstreamId, SourceId) are required to locate the resource.

.PARAMETER WorkspaceId
The workspace ID that contains the Eventstream. (Required)

.PARAMETER EventstreamId
The Eventstream ID that contains the source. (Required)

.PARAMETER SourceId
The ID of the source to retrieve. (Required)

.EXAMPLE
Get-FabricEventstreamSource -WorkspaceId "12345" -EventstreamId "67890" -SourceId "abcd"
Retrieves source "abcd" from eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before making the API call.
Author: Tiago Balabuch
#>

function Get-FabricEventstreamSource {
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
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/sources/{3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $SourceId
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
        Write-Message -Message "Failed to retrieve Eventstream Source. Error: $errorDetails" -Level Error
    }  
}