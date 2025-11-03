
<#
.SYNOPSIS
Retrieves the definition of a KQLDatabase from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the KQLDatabase's content or metadata from a workspace. 
It supports retrieving KQLDatabase definitions in the Jupyter KQLDatabase (`ipynb`) format.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the KQLDatabase definition is to be retrieved.

.PARAMETER KQLDatabaseId
(Optional)The unique identifier of the KQLDatabase whose definition needs to be retrieved.

.PARAMETER KQLDatabaseFormat
Specifies the format of the KQLDatabase definition. Currently, only 'ipynb' is supported.


.EXAMPLE
Get-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890"

Retrieves the definition of the KQLDatabase with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricKQLDatabaseDefinition -WorkspaceId "12345"

Retrieves the definitions of all KQLDatabases in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

#>
function Get-FabricKQLDatabaseDefinition {
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
        [string]$KQLDatabaseFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic    
        $apiEndpointURI = "{0}/workspaces/{1}/KQLDatabases/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId
        if ($KQLDatabaseFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $KQLDatabaseFormat
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
        Write-Message -Message "KQLDatabase '$KQLDatabaseId' definition retrieved successfully!" -Level Debug
        return $response      
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve KQLDatabase. Error: $errorDetails" -Level Error
    } 
}
