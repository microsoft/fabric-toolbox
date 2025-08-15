<#
.SYNOPSIS
Assigns a role to a principal for a specified Fabric workspace.

.DESCRIPTION
The `Add-FabricWorkspaceRoleAssignments` function assigns a role (e.g., Admin, Contributor, Member, Viewer) to a principal (e.g., User, Group, ServicePrincipal) in a Fabric workspace by making a POST request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace.

.PARAMETER PrincipalId
The unique identifier of the principal (User, Group, etc.) to assign the role.

.PARAMETER PrincipalType
The type of the principal. Allowed values: Group, ServicePrincipal, ServicePrincipalProfile, User.

.PARAMETER WorkspaceRole
The role to assign to the principal. Allowed values: Admin, Contributor, Member, Viewer.

.EXAMPLE
Add-FabricWorkspaceRoleAssignment -WorkspaceId "workspace123" -PrincipalId "principal123" -PrincipalType "User" -WorkspaceRole "Admin"

Assigns the Admin role to the user with ID "principal123" in the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  
#>

function Add-FabricWorkspaceRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$PrincipalId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Group', 'ServicePrincipal', 'ServicePrincipalProfile', 'User')]
        [string]$PrincipalType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admin', 'Contributor', 'Member', 'Viewer')]
        [string]$WorkspaceRole
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/roleAssignments" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            principal = @{
                id   = $PrincipalId
                type = $PrincipalType
            }
            role      = $WorkspaceRole
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Role '$WorkspaceRole' assigned to principal '$PrincipalId' successfully in workspace '$WorkspaceId'." -Level Info
        return $response        
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to assign role. Error: $errorDetails" -Level Error
    }
}
