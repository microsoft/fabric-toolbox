
<#
.SYNOPSIS
Retrieves the definition of a notebook from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the notebook's content or metadata from a workspace. 
It supports retrieving notebook definitions in the Jupyter Notebook (`ipynb`) format.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the notebook definition is to be retrieved.

.PARAMETER NotebookId
(Optional)The unique identifier of the notebook whose definition needs to be retrieved.

.PARAMETER NotebookFormat
Specifies the format of the notebook definition. Currently, only 'ipynb' is supported.
Default: 'ipynb'.

.EXAMPLE
Get-FabricNotebookDefinition -WorkspaceId "12345" -NotebookId "67890"

Retrieves the definition of the notebook with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricNotebookDefinition -WorkspaceId "12345"

Retrieves the definitions of all notebooks in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

#>
function Get-FabricNotebookDefinition {
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
        [ValidateSet('ipynb', 'fabricGitSource')]
        [string]$NotebookFormat = 'ipynb'
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic    
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
        if ($NotebookFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $NotebookFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
     
        # Return the API response
        Write-Message -Message "Notebook '$NotebookId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Notebook. Error: $errorDetails" -Level Error
    } 
}