<#
.SYNOPSIS
Deletes an Notebook from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricNotebook` function sends a DELETE request to the Fabric API to remove a specified Notebook from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Notebook to delete.

.PARAMETER NotebookId
(Mandatory) The ID of the Notebook to be deleted.

.EXAMPLE
Remove-FabricNotebook -WorkspaceId "12345" -NotebookId "67890"

Deletes the Notebook with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch  

#>

function Remove-FabricNotebook {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/notebooks/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
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
        Write-Message -Message "Notebook '$NotebookId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        
    }
    catch {
        # Step 5: Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete notebook '$NotebookId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
