<#
.SYNOPSIS
    Removes a job schedule from a Microsoft Fabric item.

.DESCRIPTION
    The Remove-FabricItemSchedule function sends a DELETE request to the Microsoft Fabric API
    to remove a schedule for a specific job type on an item via
    /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules/{scheduleId}.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item whose schedule is removed. Mandatory.

.PARAMETER JobType
    The job type of the schedule (e.g. 'RunNotebook', 'Pipeline'). Mandatory.

.PARAMETER ScheduleId
    The unique identifier of the schedule to delete. Mandatory.

.EXAMPLE
    Remove-FabricItemSchedule -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType 'RunNotebook' -ScheduleId "sched-1"

    Removes the specified schedule from the item.

.EXAMPLE
    Get-FabricItemSchedule -WorkspaceId $ws -ItemId $item -JobType 'RunNotebook' | Remove-FabricItemSchedule -Confirm:$false

    Removes all schedules for the job type by piping them from Get-FabricItemSchedule.

.NOTES
    - API Endpoint: DELETE /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules/{scheduleId}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Remove-FabricItemSchedule {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$JobType,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ScheduleId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'items', $ItemId, 'jobs', $JobType, 'schedules', $ScheduleId)
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }

            if ($PSCmdlet.ShouldProcess($ScheduleId, "Remove schedule from item '$ItemId'")) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Schedule '$ScheduleId' removed successfully!" -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove schedule '$ScheduleId'. Error: $errorDetails" -Level Error
        }
    }
}
