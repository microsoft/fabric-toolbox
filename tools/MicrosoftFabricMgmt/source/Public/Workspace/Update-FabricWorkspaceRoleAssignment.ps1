<#
.SYNOPSIS
Updates the role assignment for a specific principal in a Fabric workspace.

.DESCRIPTION
The `Update-FabricWorkspaceRoleAssignment` function updates the role assigned to a principal in a workspace by making a PATCH request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the role assignment exists.

.PARAMETER WorkspaceRoleAssignmentId
The unique identifier of the role assignment to be updated.

.PARAMETER WorkspaceRole
The new role to assign to the principal. Must be one of the following:
- Admin
- Contributor
- Member
- Viewer

.EXAMPLE
Update-FabricWorkspaceRoleAssignment -WorkspaceId "workspace123" -WorkspaceRoleAssignmentId "assignment456" -WorkspaceRole "Admin"

Updates the role assignment to "Admin" for the specified workspace and role assignment.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Update-FabricWorkspaceRoleAssignment {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceRoleAssignmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admin', 'Contributor', 'Member', 'Viewer')]
        [string]$WorkspaceRole
    )
    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'roleAssignments' -ItemId $WorkspaceRoleAssignmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            role = $WorkspaceRole
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Role assignment '$WorkspaceRoleAssignmentId' in workspace '$WorkspaceId' to '$WorkspaceRole'", 'Update')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Role assignment $WorkspaceRoleAssignmentId updated successfully in workspace '$WorkspaceId'." -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update role assignment. Error: $errorDetails" -Level Error
    }
}
