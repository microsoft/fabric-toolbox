<#
.SYNOPSIS
    Initiates a workspace information scan using the Power BI admin API.

.DESCRIPTION
    The Start-FabricAdminWorkspaceScan cmdlet starts a scan to gather workspace information using the admin API.

.PARAMETER WorkspaceIds
    Optional. Array of workspace IDs to scan. If not provided, scans all workspaces.

.EXAMPLE
    Start-FabricAdminWorkspaceScan

    Initiates a scan of all workspaces.

.EXAMPLE
    Start-FabricAdminWorkspaceScan -WorkspaceIds "workspace1","workspace2"

    Initiates a scan of specific workspaces.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/workspaces/getInfo
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Start-FabricAdminWorkspaceScan {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string[]]$WorkspaceIds
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/workspaces/getInfo"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{}
            if ($WorkspaceIds) {
                $body.workspaceIds = $WorkspaceIds
            }
            $bodyJson = if ($body.Count -gt 0) { $body | ConvertTo-Json -Depth 10 } else { '{}' }

            if ($PSCmdlet.ShouldProcess("Workspaces", "Start information scan")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Workspace information scan initiated successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to start workspace scan. Error: $errorDetails" -Level Error
        }
    }
}
