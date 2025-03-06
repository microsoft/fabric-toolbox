<#
.SYNOPSIS
Deletes an KQLDashboard from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLDashboard` function sends a DELETE request to the Fabric API to remove a specified KQLDashboard from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLDashboard to delete.

.PARAMETER KQLDashboardId
(Mandatory) The ID of the KQLDashboard to be deleted.

.EXAMPLE
Remove-FabricKQLDashboard -WorkspaceId "12345" -KQLDashboardId "67890"

Deletes the KQLDashboard with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch  

#>

function Remove-FabricKQLDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/kqlDashboards/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Delete `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -StatusCodeVariable "statusCode"

        # Step 4: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }
        Write-Message -Message "KQLDashboard '$KQLDashboardId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        
    }
    catch {
        # Step 5: Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete KQLDashboard '$KQLDashboardId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
