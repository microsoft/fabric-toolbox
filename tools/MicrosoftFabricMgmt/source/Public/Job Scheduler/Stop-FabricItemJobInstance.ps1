<#
.SYNOPSIS
    Cancels a running job instance on a Microsoft Fabric item.

.DESCRIPTION
    The Stop-FabricItemJobInstance function requests cancellation of a job instance on a
    Fabric item via POST to
    /workspaces/{workspaceId}/items/{itemId}/jobs/instances/{jobInstanceId}/cancel.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item whose job instance is cancelled. Mandatory.

.PARAMETER JobInstanceId
    The unique identifier of the job instance to cancel. Mandatory.

.EXAMPLE
    Stop-FabricItemJobInstance -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobInstanceId "inst-1"

    Requests cancellation of the specified job instance.

.EXAMPLE
    Get-FabricItemJobInstance -WorkspaceId $ws -ItemId $item | Where-Object status -eq 'InProgress' | Stop-FabricItemJobInstance -Confirm:$false

    Cancels all in-progress job instances by piping them from Get-FabricItemJobInstance.

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/items/{itemId}/jobs/instances/{jobInstanceId}/cancel
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Stop-FabricItemJobInstance {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$JobInstanceId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'items', $ItemId, 'jobs', 'instances', $JobInstanceId, 'cancel')
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            if ($PSCmdlet.ShouldProcess($JobInstanceId, "Cancel job instance on item '$ItemId'")) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Cancellation requested for job instance '$JobInstanceId'." -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to cancel job instance '$JobInstanceId'. Error: $errorDetails" -Level Error
        }
    }
}
