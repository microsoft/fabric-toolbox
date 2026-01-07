<#
.SYNOPSIS
Refreshes metadata for a SQL Endpoint.

.DESCRIPTION
The Update-FabricSQLEndpointMetadata cmdlet triggers a metadata refresh for a SQL Endpoint in a specified Fabric
workspace. Use -WaitForCompletion to block until the server completes the refresh operation and returns final status.

.PARAMETER WorkspaceId
The GUID of the workspace hosting the SQL Endpoint. Required to construct the refresh endpoint URL.

.PARAMETER SQLEndpointId
The resource Id of the SQL Endpoint to refresh. Required so the service can identify which endpoint to process.

.PARAMETER WaitForCompletion
Switch parameter. When present, waits for the refresh job to complete and returns final details. If omitted, the cmdlet
starts the job and returns immediately with the async operation metadata.

.EXAMPLE
Update-FabricSQLEndpointMetadata -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

Starts an asynchronous metadata refresh and returns immediately.

.EXAMPLE
Update-FabricSQLEndpointMetadata -WorkspaceId "workspace123" -SQLEndpointId "endpoint456" -WaitForCompletion

Starts a refresh and waits until it completes before returning.

.NOTES
    - Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
    - Calls Test-TokenExpired to ensure token validity before making the API request.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026


#>
function Update-FabricSQLEndpointMetadata {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
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
        if ($PSCmdlet.ShouldProcess("SQL Endpoint '$SQLEndpointId' in workspace '$WorkspaceId'", "Update metadata")) {
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
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update SQL Endpoint metadata. Error: $errorDetails" -Level Error
    }
}
