<#
.SYNOPSIS
Sets (modifies) the OneLake immutability policy for a Microsoft Fabric workspace.

.DESCRIPTION
The Set-FabricOneLakeImmutabilityPolicy function configures the OneLake immutability
policy for a workspace via POST to the Fabric
`/workspaces/{workspaceId}/onelake/settings/modifyImmutabilityPolicy` endpoint.

An immutability policy protects data written under the given scope from being changed or
deleted for a defined retention window. The request body is built from the -Scope and
-RetentionDays parameters. The API response is returned as-is.

.PARAMETER WorkspaceId
The unique identifier of the workspace whose immutability policy is set. Mandatory.

.PARAMETER Scope
The scope the immutability policy applies to. Valid value: DiagnosticLogs. Mandatory.

.PARAMETER RetentionDays
The number of days data in the scope is retained as immutable. Must be 1 or greater. Mandatory.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Set-FabricOneLakeImmutabilityPolicy -WorkspaceId "12345678-1234-1234-1234-123456789012" -Scope 'DiagnosticLogs' -RetentionDays 30

Configures a 30-day immutability policy for diagnostic logs in the workspace.

.OUTPUTS
System.Object
The API response returned after modifying the immutability policy.

.NOTES
- API Endpoint: POST /workspaces/{workspaceId}/onelake/settings/modifyImmutabilityPolicy
- Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Set-FabricOneLakeImmutabilityPolicy {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('DiagnosticLogs')]
        [string]$Scope,

        [Parameter(Mandatory = $true)]
        [ValidateRange(1, [int]::MaxValue)]
        [int]$RetentionDays,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'onelake/settings/modifyImmutabilityPolicy'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                scope         = $Scope
                retentionDays = $RetentionDays
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($WorkspaceId, "Set OneLake immutability policy ($Scope, $RetentionDays days)")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "OneLake immutability policy for workspace '$WorkspaceId' set successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to set OneLake immutability policy for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
