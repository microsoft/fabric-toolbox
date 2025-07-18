<#
.SYNOPSIS
Retrieves an environment or a list of environments from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricEnvironment` function sends a GET request to the Fabric API to retrieve environment details for a given workspace. It can filter the results by `EnvironmentName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query environments.

.PARAMETER EnvironmentName
(Optional) The name of the specific environment to retrieve.

.EXAMPLE
Get-FabricEnvironment -WorkspaceId "12345" -EnvironmentName "Development"

Retrieves the "Development" environment from workspace "12345".

.EXAMPLE
Get-FabricEnvironment -WorkspaceId "12345"

Retrieves all environments in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Returns the matching environment details or all environments if no filter is provided.

Author: Tiago Balabuch  

#>

function Get-FabricEnvironment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EnvironmentName
    )
    try {
        # Validate input parameters
        if ($EnvironmentId -and $EnvironmentName) {
            Write-Message -Message "Specify only one parameter: either 'EnvironmentId' or 'EnvironmentName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/environments" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($EnvironmentId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $EnvironmentId }, 'First')
        }
        elseif ($EnvironmentName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $EnvironmentName }, 'First')
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
        Write-Message -Message "Failed to retrieve environment. Error: $errorDetails" -Level Error
    } 
 
}
