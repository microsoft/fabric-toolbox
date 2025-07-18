<#
.SYNOPSIS
Retrieves the definition of a Copy Job from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the Copy Job's content or metadata from a workspace. 
It supports both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the Copy Job definition is to be retrieved.

.PARAMETER CopyJobId
(Mandatory) The unique identifier of the Copy Job whose definition needs to be retrieved.

.PARAMETER CopyJobFormat
(Optional) Specifies the format of the Copy Job definition. For example, 'json' or 'xml'.

.EXAMPLE
Get-FabricCopyJobDefinition -WorkspaceId "12345" -CopyJobId "67890"

Retrieves the definition of the Copy Job with ID `67890` from the workspace with ID `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
- Logs detailed information for debugging purposes.

#>
function Get-FabricCopyJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $CopyJobId

        # Append the format query parameter if specified by the user.
        if ($CopyJobFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $CopyJobFormat
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
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Copy Job definition. Error: $errorDetails" -Level Error
    } 
}