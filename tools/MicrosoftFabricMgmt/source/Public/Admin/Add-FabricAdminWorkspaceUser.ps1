<#
.SYNOPSIS
    Adds a user to a workspace using the Power BI admin API.

.DESCRIPTION
    The Add-FabricAdminWorkspaceUser cmdlet adds a user, group, or service principal to a workspace with specified permissions using the admin API.

.PARAMETER WorkspaceId
    Required. The workspace ID to add the user to.

.PARAMETER Identifier
    Required. The user's email, object ID, or user principal name.

.PARAMETER AccessRight
    Required. The permission level: Admin, Member, Contributor, or Viewer.

.PARAMETER PrincipalType
    Required. The type of principal: User, Group, or App.

.EXAMPLE
    Add-FabricAdminWorkspaceUser -WorkspaceId "workspace123" -Identifier "user@example.com" -AccessRight "Member" -PrincipalType "User"

    Adds a user as a member to the specified workspace.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/groups/{workspaceId}/users
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Add-FabricAdminWorkspaceUser {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Identifier,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Admin', 'Member', 'Contributor', 'Viewer')]
        [string]$AccessRight,

        [Parameter(Mandatory = $true)]
        [ValidateSet('User', 'Group', 'App')]
        [string]$PrincipalType
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/users"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                identifier     = $Identifier
                accessRight    = $AccessRight
                principalType  = $PrincipalType
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId'", "Add user '$Identifier' with '$AccessRight' role")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "User '$Identifier' added to workspace '$WorkspaceId' with '$AccessRight' role." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to add user to workspace. Error: $errorDetails" -Level Error
        }
    }
}
