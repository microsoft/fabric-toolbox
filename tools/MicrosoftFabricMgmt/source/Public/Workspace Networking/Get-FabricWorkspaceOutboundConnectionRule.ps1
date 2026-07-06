<#
.SYNOPSIS
Retrieves the outbound cloud connection rules for a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricWorkspaceOutboundConnectionRule function retrieves the outbound cloud
connection rules for a workspace enabled with Outbound Access Protection (OAP) via GET to
the Fabric `/workspaces/{workspaceId}/networking/communicationPolicy/outbound/connections`
endpoint. Rules are only returned when the workspace's network communication policy has
`outbound.publicAccessRules.defaultAction` set to Deny. This feature is currently in preview.

By default the returned object is enriched with the originating WorkspaceId (stamped from
the parameter) and a resolved WorkspaceName, and decorated for the custom table view.
Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose outbound connection rules are retrieved. Mandatory.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricWorkspaceOutboundConnectionRule -WorkspaceId "12345678-1234-1234-1234-123456789012"

Returns the outbound cloud connection rules for the workspace, enriched with WorkspaceName.

.OUTPUTS
System.Object
The outbound connection rules object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
- API Endpoint: GET /workspaces/{workspaceId}/networking/communicationPolicy/outbound/connections
- Requires: authentication via Connect-FabricAccount.
- Preview: this API is part of a Fabric Preview release.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricWorkspaceOutboundConnectionRule {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'networking/communicationPolicy/outbound/connections'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No outbound connection rules returned for workspace '$WorkspaceId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($item in $response) {
                $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.WorkspaceOutboundConnectionRule'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve outbound connection rules for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
