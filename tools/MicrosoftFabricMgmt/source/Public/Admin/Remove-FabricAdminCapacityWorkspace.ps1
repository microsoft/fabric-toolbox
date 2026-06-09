<#
.SYNOPSIS
    Unassigns workspaces from a capacity using the Power BI admin API.

.DESCRIPTION
    The Remove-FabricAdminCapacityWorkspace cmdlet unassigns one or more workspaces from a capacity using the admin API.

.PARAMETER WorkspaceIds
    Required. Array of workspace IDs to unassign from their current capacity.

.EXAMPLE
    Remove-FabricAdminCapacityWorkspace -WorkspaceIds "workspace1","workspace2"

    Unassigns two workspaces from their capacity.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/capacities/UnassignWorkspacesFromCapacity
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Remove-FabricAdminCapacityWorkspace {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string[]]$WorkspaceIds
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/UnassignWorkspacesFromCapacity"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                workspaceIds = $WorkspaceIds
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Workspaces", "Unassign $($WorkspaceIds.Count) workspace(s) from capacity")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Successfully unassigned $($WorkspaceIds.Count) workspace(s) from capacity." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to unassign workspaces from capacity. Error: $errorDetails" -Level Error
        }
    }
}
