<#
.SYNOPSIS
Removes a role assignment from a Fabric workspace.

.DESCRIPTION
The `Remove-FabricWorkspaceRoleAssignment` function deletes a specific role assignment from a Fabric workspace by making a DELETE request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace.

.PARAMETER WorkspaceRoleAssignmentId
The unique identifier of the role assignment to be removed.

.EXAMPLE
Remove-FabricWorkspaceRoleAssignment -WorkspaceId "workspace123" -WorkspaceRoleAssignmentId "role123"

Removes the role assignment with the ID "role123" from the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Remove-FabricWorkspaceRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceRoleAssignmentId
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/roleAssignments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WorkspaceRoleAssignmentId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Delete `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 4: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }
        
        Write-Message -Message "Role assignment '$WorkspaceRoleAssignmentId' successfully removed from workspace '$WorkspaceId'." -Level Info
    }
    catch {
        # Step 5: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to remove role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
