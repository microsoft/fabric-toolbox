<#
.SYNOPSIS
Retrieves Livy session(s) for a specified notebook in Microsoft Fabric.

.DESCRIPTION
Get-FabricNotebookLivySession fetches Livy session details from the Fabric API for a given workspace and notebook. You can optionally filter by a specific Livy session ID.

.PARAMETER WorkspaceId
The ID of the workspace containing the notebook.

.PARAMETER NotebookId
The ID of the notebook for which to retrieve Livy sessions.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricNotebookLivySession -WorkspaceId "12345" -NotebookId "67890"

Returns all Livy sessions for the specified notebook.

.EXAMPLE
Get-FabricNotebookLivySession -WorkspaceId "12345" -NotebookId "67890" -LivyId "abcde"

Returns the Livy session with ID "abcde" for the specified notebook.

.NOTES
Requires the global $FabricConfig object with BaseUrl and FabricHeaders.
Calls Test-TokenExpired to validate authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricNotebookLivySession {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId
    )
    try {   
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}/livySessions" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
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

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
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
        Write-Message -Message "Failed to retrieve Notebook Livy Session. Error: $errorDetails" -Level Error
    }
}