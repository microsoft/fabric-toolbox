<#
.SYNOPSIS
Retrieves an Eventstream or a list of Eventstreams from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricEventstream` function sends a GET request to the Fabric API to retrieve Eventstream details for a given workspace. It can filter the results by `EventstreamName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query Eventstreams.

.PARAMETER EventstreamName
(Optional) The name of the specific Eventstream to retrieve.

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345" -EventstreamName "Development"

Retrieves the "Development" Eventstream from workspace "12345".

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345"

Retrieves all Eventstreams in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Get-FabricEventstream {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName
    )

    try {
        # Validate input parameters
        if ($EventstreamId -and $EventstreamName) {
            Write-Message -Message "Specify only one parameter: either 'EventstreamId' or 'EventstreamName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
        # Make the API request
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
        if ($EventstreamId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $EventstreamId }, 'First')
        }
        elseif ($EventstreamName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $EventstreamName }, 'First')
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
        Write-Message -Message "Failed to retrieve Eventstream. Error: $errorDetails" -Level Error
    } 
 
}
