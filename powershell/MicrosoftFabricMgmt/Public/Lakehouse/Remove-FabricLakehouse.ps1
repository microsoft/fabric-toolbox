<#
.SYNOPSIS
Deletes an Lakehouse from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricLakehouse` function sends a DELETE request to the Fabric API to remove a specified Lakehouse from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Lakehouse to delete.

.PARAMETER LakehouseId
(Mandatory) The ID of the Lakehouse to be deleted.

.EXAMPLE
Remove-FabricLakehouse -WorkspaceId "12345" -LakehouseId "67890"

Deletes the Lakehouse with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch  

#>

function Remove-FabricLakehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/lakehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId
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
        Write-Message -Message "Lakehouse '$LakehouseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        
    }
    catch {
        # Step 5: Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Lakehouse '$LakehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
