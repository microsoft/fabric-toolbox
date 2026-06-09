<#
.SYNOPSIS
    Removes a user from a workspace using the Power BI admin API.

.DESCRIPTION
    The Remove-FabricAdminWorkspaceUser cmdlet removes a user from a workspace using the admin API.

.PARAMETER WorkspaceId
    Required. The workspace ID to remove the user from.

.PARAMETER User
    Required. The user identifier (email or object ID).

.EXAMPLE
    Remove-FabricAdminWorkspaceUser -WorkspaceId "workspace123" -User "user@example.com"

    Removes a user from the specified workspace.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/groups/{workspaceId}/users/{user}
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Remove-FabricAdminWorkspaceUser {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$User
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId/users/$User"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId'", "Remove user '$User'")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "User '$User' removed from workspace '$WorkspaceId'." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove user from workspace. Error: $errorDetails" -Level Error
        }
    }
}
