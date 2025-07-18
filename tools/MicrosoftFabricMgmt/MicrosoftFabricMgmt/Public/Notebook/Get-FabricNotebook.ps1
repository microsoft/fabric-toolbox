<#
.SYNOPSIS
Retrieves an Notebook or a list of Notebooks from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricNotebook` function sends a GET request to the Fabric API to retrieve Notebook details for a given workspace. It can filter the results by `NotebookName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query Notebooks.

.PARAMETER NotebookName
(Optional) The name of the specific Notebook to retrieve.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -NotebookName "Development"

Retrieves the "Development" Notebook from workspace "12345".

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345"

Retrieves all Notebooks in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Get-FabricNotebook {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$NotebookName
    )
    try {
        # Validate input parameters
        if ($NotebookId -and $NotebookName) {
            Write-Message -Message "Specify only one parameter: either 'NotebookId' or 'NotebookName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($NotebookId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $NotebookId }, 'First')
        }
        elseif ($NotebookName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $NotebookName }, 'First')
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
        Write-Message -Message "Failed to retrieve Notebook. Error: $errorDetails" -Level Error
    } 
}
