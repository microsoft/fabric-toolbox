<#
.SYNOPSIS
    Updates a workspace using the Power BI admin API.

.DESCRIPTION
    The Update-FabricAdminWorkspace cmdlet updates properties of a workspace using the admin API.

.PARAMETER WorkspaceId
    Required. The workspace ID to update.

.PARAMETER DisplayName
    Optional. The new display name for the workspace.

.PARAMETER Description
    Optional. The new description for the workspace.

.EXAMPLE
    Update-FabricAdminWorkspace -WorkspaceId "workspace123" -DisplayName "Updated Name"

    Updates the display name of a workspace.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/groups/{workspaceId}
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Update-FabricAdminWorkspace {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DisplayName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/groups/$WorkspaceId"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{}
            if ($DisplayName) {
                $body.displayName = $DisplayName
            }
            if ($Description) {
                $body.description = $Description
            }

            $bodyJson = if ($body.Count -gt 0) { $body | ConvertTo-Json -Depth 10 } else { '{}' }

            if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId'", "Update")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Patch'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Workspace '$WorkspaceId' updated successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update workspace. Error: $errorDetails" -Level Error
        }
    }
}
