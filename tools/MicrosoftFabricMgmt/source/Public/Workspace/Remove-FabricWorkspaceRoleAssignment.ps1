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
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceRoleAssignmentId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/roleAssignments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WorkspaceRoleAssignmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Role assignment '$WorkspaceRoleAssignmentId' in workspace '$WorkspaceId'", 'Remove')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Role assignment '$WorkspaceRoleAssignmentId' successfully removed from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to remove role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
