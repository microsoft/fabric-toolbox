<#
.SYNOPSIS
Retrieves SQL Endpoints from a specified workspace in Fabric.

.DESCRIPTION
The Get-FabricSQLEndpoint function retrieves SQL Endpoints from a specified workspace in Fabric. 
It supports filtering by SQL Endpoint ID or SQL Endpoint Name. If both filters are provided, 
an error message is returned. The function handles token validation, API requests with continuation 
tokens, and processes the response to return the desired SQL Endpoint(s).

.PARAMETER WorkspaceId
The ID of the workspace from which to retrieve SQL Endpoints. This parameter is mandatory.

.PARAMETER SQLEndpointId
The ID of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointName.

.PARAMETER SQLEndpointName
The name of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointId.

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointName "MySQLEndpoint"

.NOTES
- This function requires the FabricConfig object to be properly configured with BaseUrl and FabricHeaders.
- The function uses continuation tokens to handle paginated API responses.
- If no filter parameters are provided, all SQL Endpoints in the specified workspace are returned.

#>
function Get-FabricSQLEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SQLEndpointName
    )
    try {
        # Validate input parameters
        if ($SQLEndpointId -and $SQLEndpointName) {
            Write-Message -Message "Specify only one parameter: either 'SQLEndpointId' or 'SQLEndpointName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/SQLEndpoints" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
        # Make the API request
        $dataItems = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Get
           
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SQLEndpointId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $SQLEndpointId }, 'First')
        }
        elseif ($SQLEndpointName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $SQLEndpointName }, 'First')
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
        Write-Message -Message "Failed to retrieve Paginated Report. Error: $errorDetails" -Level Error
    } 
}