<#
.SYNOPSIS
Refreshes the metadata for a specific SQL Endpoint in a Fabric workspace.

.DESCRIPTION
The Update-FabricSQLEndpointMetadata function triggers a metadata refresh for a given SQL Endpoint within a specified Fabric workspace. 
It validates authentication, constructs the appropriate API endpoint, and initiates the refresh operation. 
Optionally, it can wait for the operation to complete before returning.

.PARAMETER WorkspaceId
The ID of the workspace containing the SQL Endpoint. This parameter is required.

.PARAMETER SQLEndpointId
The ID of the SQL Endpoint whose metadata will be refreshed. This parameter is required.

.PARAMETER WaitForCompletion
If specified, the function waits for the metadata refresh operation to complete before returning.

.EXAMPLE
Update-FabricSQLEndpointMetadata -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

.EXAMPLE
Update-FabricSQLEndpointMetadata -WorkspaceId "workspace123" -SQLEndpointId "endpoint456" -WaitForCompletion

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
#>
function Update-FabricSQLEndpointMetadata {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLEndpointId,
        [Parameter(Mandatory = $true)]
        [switch]$WaitForCompletion
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/sqlEndpoints/{2}/refreshMetadata" -f $FabricConfig.BaseUrl, $WorkspaceId, $SQLEndpointId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        if ($WaitForCompletion.IsPresent) {
            $apiParams.WaitForCompletion = $true
        }
        $response = Invoke-FabricAPIRequest @apiParams
          
        if ($WaitForCompletion) {
            Write-Message -Message "Refresh SQL Endpoint metadata for SQL Endpoint '$($SQLEndpointId)' has completed." -Level Info
            Write-Message -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
        }
        else {
            Write-Message -Message "Refresh SQL Endpoint metadata for SQL Endpoint '$($SQLEndpointId)' has been started and is running asynchronously." -Level Info
            Write-Message -Message "You can monitor the job status using the job ID from the response." -Level Debug
        }
        # Return the API response
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update SQL Endpoint metadata. Error: $errorDetails" -Level Error
    } 
}