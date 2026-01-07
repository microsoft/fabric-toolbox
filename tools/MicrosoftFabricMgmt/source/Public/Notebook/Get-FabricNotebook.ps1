<#
.SYNOPSIS
Gets a Notebook or lists all Notebooks in a workspace.

.DESCRIPTION
The Get-FabricNotebook cmdlet retrieves Notebook items for a specific Microsoft Fabric workspace. You can list all
notebooks or filter by an exact display name or resource Id. Only one of NotebookId or NotebookName can be specified.

.PARAMETER WorkspaceId
The GUID of the workspace to query for notebooks. This parameter is required to scope the API request.

.PARAMETER NotebookId
Optional. When supplied, returns only the notebook whose Id matches this value. Use this when you already know the
resource Id from a prior call.

.PARAMETER NotebookName
Optional. When supplied, returns only the notebook whose display name exactly matches this string. Do not combine with
NotebookId.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -NotebookId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the notebook matching the provided Id.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -NotebookName "Development"

Retrieves the notebook named Development from workspace 12345.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345"

Lists all notebooks in the workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

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
            Write-FabricLog -Message "Specify only one parameter: either 'NotebookId' or 'NotebookName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

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
            Write-FabricLog -Message "No data returned from the API." -Level Warning
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
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Notebook. Error: $errorDetails" -Level Error
    }
}
