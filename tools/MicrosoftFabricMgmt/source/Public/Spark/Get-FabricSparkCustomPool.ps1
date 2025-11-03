<#
.SYNOPSIS
    Retrieves Spark custom pools from a specified workspace.

.DESCRIPTION
    This function retrieves all Spark custom pools from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.
    The function supports filtering by SparkCustomPoolId or SparkCustomPoolName, but not both simultaneously.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve Spark custom pools. This parameter is mandatory.

.PARAMETER SparkCustomPoolId
    The ID of the specific Spark custom pool to retrieve. This parameter is optional.

.PARAMETER SparkCustomPoolName
    The name of the specific Spark custom pool to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345"
    This example retrieves all Spark custom pools from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolId "pool1"
    This example retrieves the Spark custom pool with ID "pool1" from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolName "MyPool"
    This example retrieves the Spark custom pool with name "MyPool" from the workspace with ID "12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Handles continuation tokens to retrieve all Spark custom pools if there are multiple pages of results.

    Author: Tiago Balabuch
#>
function Get-FabricSparkCustomPool {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkCustomPoolId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkCustomPoolName
    )
    try {
        # Validate input parameters
        if ($SparkCustomPoolId -and $SparkCustomPoolName) {
            Write-Message -Message "Specify only one parameter: either 'SparkCustomPoolId' or 'SparkCustomPoolName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/spark/pools" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($SparkCustomPoolId) {
            $matchedItems = $dataItems.Where({ $_.id -eq $SparkCustomPoolId }, 'First')
        }
        elseif ($SparkCustomPoolName) {
            $matchedItems = $dataItems.Where({ $_.name -eq $SparkCustomPoolName }, 'First')
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
        Write-Message -Message "Failed to retrieve SparkCustomPool. Error: $errorDetails" -Level Error
    } 
 
}
