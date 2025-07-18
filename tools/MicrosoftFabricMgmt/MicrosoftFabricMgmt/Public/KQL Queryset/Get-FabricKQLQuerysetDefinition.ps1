
<#
.SYNOPSIS
Retrieves the definition of a KQLQueryset from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the KQLQueryset's content or metadata from a workspace. 
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the KQLQueryset definition is to be retrieved.

.PARAMETER KQLQuerysetId
(Optional)The unique identifier of the KQLQueryset whose definition needs to be retrieved.

.PARAMETER KQLQuerysetFormat
Specifies the format of the KQLQueryset definition.

.EXAMPLE
Get-FabricKQLQuerysetDefinition -WorkspaceId "12345" -KQLQuerysetId "67890"

Retrieves the definition of the KQLQueryset with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricKQLQuerysetDefinition -WorkspaceId "12345"

Retrieves the definitions of all KQLQuerysets in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

#>
function Get-FabricKQLQuerysetDefinition {
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
        [string]$KQLQuerysetFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic    
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId
        if ($KQLQuerysetFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $KQLQuerysetFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
      
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
     
        Write-Message -Message "KQLQueryset '$KQLQuerysetId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve KQLQueryset. Error: $errorDetails" -Level Error
    } 
 
}
