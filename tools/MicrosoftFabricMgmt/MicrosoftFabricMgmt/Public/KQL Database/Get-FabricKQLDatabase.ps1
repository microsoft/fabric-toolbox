<#
.SYNOPSIS
Retrieves an KQLDatabase or a list of KQLDatabases from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricKQLDatabase` function sends a GET request to the Fabric API to retrieve KQLDatabase details for a given workspace. It can filter the results by `KQLDatabaseName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query KQLDatabases.

.PARAMETER KQLDatabaseName
(Optional) The name of the specific KQLDatabase to retrieve.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId "12345" -KQLDatabaseName "Development"

Retrieves the "Development" KQLDatabase from workspace "12345".

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId "12345"

Retrieves all KQLDatabases in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Get-FabricKQLDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName
    )
    try {
        # Validate input parameters
        if ($KQLDatabaseId -and $KQLDatabaseName) {
            Write-Message -Message "Specify only one parameter: either 'KQLDatabaseId' or 'KQLDatabaseName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($KQLDatabaseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLDatabaseId }, 'First')
        }
        elseif ($KQLDatabaseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLDatabaseName }, 'First')
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
        Write-Message -Message "Failed to retrieve KQLDatabase. Error: $errorDetails" -Level Error
    } 
 
}
