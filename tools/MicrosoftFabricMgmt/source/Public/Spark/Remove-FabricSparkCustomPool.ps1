<#
.SYNOPSIS
    Removes a Spark custom pool from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a Spark custom pool 
    from the specified workspace using the provided WorkspaceId and SparkCustomPoolId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Spark custom pool will be removed.

.PARAMETER SparkCustomPoolId
    The unique identifier of the Spark custom pool to be removed.

.EXAMPLE
    Remove-FabricSparkCustomPool -WorkspaceId "workspace-12345" -SparkCustomPoolId "pool-67890"
    This example removes the Spark custom pool with ID "pool-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Remove-FabricSparkCustomPool {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkCustomPoolId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/pools/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkCustomPoolId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        ## Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Spark Custom Pool '$SparkCustomPoolId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete SparkCustomPool '$SparkCustomPoolId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
