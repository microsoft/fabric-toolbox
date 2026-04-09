<#
.SYNOPSIS
    Assigns workspaces to a capacity using the Power BI admin API.

.DESCRIPTION
    The Add-FabricAdminCapacityWorkspace cmdlet assigns one or more workspaces to a capacity using the admin API.

.PARAMETER CapacityId
    Required. The capacity ID to assign workspaces to.

.PARAMETER WorkspaceIds
    Required. Array of workspace IDs to assign to the capacity.

.EXAMPLE
    Add-FabricAdminCapacityWorkspace -CapacityId "capacity123" -WorkspaceIds "workspace1","workspace2"

    Assigns two workspaces to the specified capacity.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/capacities/{capacityId}/AssignWorkspaces
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Add-FabricAdminCapacityWorkspace {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string[]]$WorkspaceIds
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId/AssignWorkspaces"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                workspaceIds = $WorkspaceIds
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Capacity '$CapacityId'", "Assign $($WorkspaceIds.Count) workspace(s)")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Successfully assigned $($WorkspaceIds.Count) workspace(s) to capacity '$CapacityId'." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to assign workspaces to capacity. Error: $errorDetails" -Level Error
        }
    }
}
