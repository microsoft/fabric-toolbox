<#
.SYNOPSIS
    Restores a deleted workspace using the admin API.

.DESCRIPTION
    The Restore-FabricAdminWorkspace cmdlet restores a previously deleted workspace using the admin API.
    Requires Fabric Administrator permissions.

.PARAMETER WorkspaceId
    The GUID of the deleted workspace to restore.

.PARAMETER RestoredWorkspaceName
    Optional. The new name for the restored workspace. If not provided, the original name is used.

.PARAMETER EmailOwnerOnRestore
    Optional. When set to true, sends an email to the workspace owner when the restoration is complete.

.EXAMPLE
    Restore-FabricAdminWorkspace -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Restores the deleted workspace with its original name.

.EXAMPLE
    Restore-FabricAdminWorkspace -WorkspaceId "12345678-1234-1234-1234-123456789012" -RestoredWorkspaceName "Restored Workspace"

    Restores the deleted workspace with a new name.

.EXAMPLE
    Get-FabricAdminWorkspace -State "deleted" | Restore-FabricAdminWorkspace

    Restores all deleted workspaces.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.ReadWrite.All scope.
    - Rate limited to 10 requests per minute.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Restore-FabricAdminWorkspace {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RestoredWorkspaceName,

        [Parameter(Mandatory = $false)]
        [switch]$EmailOwnerOnRestore
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/workspaces/{1}/restore" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{}
            if ($RestoredWorkspaceName) {
                $body.restoredWorkspaceName = $RestoredWorkspaceName
            }
            if ($EmailOwnerOnRestore) {
                $body.emailOwnerOnRestore = $true
            }

            $bodyJson = if ($body.Count -gt 0) { $body | ConvertTo-Json -Depth 10 } else { '{}' }

            if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId'", "Restore")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Workspace '$WorkspaceId' restored successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to restore workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
