<#
.SYNOPSIS
Retrieves an KQLQueryset or a list of KQLQuerysets from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricKQLQueryset` function sends a GET request to the Fabric API to retrieve KQLQueryset details for a given workspace. It can filter the results by `KQLQuerysetName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query KQLQuerysets.

.PARAMETER KQLQuerysetName
(Optional) The name of the specific KQLQueryset to retrieve.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId "12345" -KQLQuerysetName "Development"

Retrieves the "Development" KQLQueryset from workspace "12345".

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId "12345"

Retrieves all KQLQuerysets in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Get-FabricKQLQueryset {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLQuerysetName
    )
    try {
        # Validate input parameters
        if ($KQLQuerysetId -and $KQLQuerysetName) {
            Write-Message -Message "Specify only one parameter: either 'KQLQuerysetId' or 'KQLQuerysetName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($KQLQuerysetId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLQuerysetId }, 'First')
        }
        elseif ($KQLQuerysetName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLQuerysetName }, 'First')
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
        Write-Message -Message "Failed to retrieve KQLQueryset. Error: $errorDetails" -Level Error
    } 
 
}
