<#
.SYNOPSIS
    Retrieves job schedules for a Microsoft Fabric item.

.DESCRIPTION
    The Get-FabricItemSchedule function retrieves the schedules configured for a specific
    job type on a Fabric item.

    When -ScheduleId is supplied it returns the single matching schedule via
    /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules/{scheduleId};
    otherwise it lists all schedules for the job type via
    /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules.

    By default each returned object is enriched with the originating WorkspaceId (stamped
    from the parameter) and a resolved WorkspaceName, and decorated for the custom table
    view. Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item whose schedules are retrieved. Mandatory.

.PARAMETER JobType
    The job type whose schedules should be retrieved (e.g. 'RunNotebook', 'Pipeline'). Mandatory.

.PARAMETER ScheduleId
    Optional. The unique identifier of a single schedule to retrieve.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricItemSchedule -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType 'RunNotebook'

    Lists all RunNotebook schedules for the item, enriched with WorkspaceName.

.EXAMPLE
    Get-FabricItemSchedule -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType 'RunNotebook' -ScheduleId "sched-1"

    Returns the single schedule with that ID.

.OUTPUTS
    System.Object
    Schedule object(s) with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoints:
        GET /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules
        GET /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules/{scheduleId}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricItemSchedule {
    [CmdletBinding()]
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

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ScheduleId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build the segment list, appending ScheduleId only when a single schedule is requested.
            $segments = @('workspaces', $WorkspaceId, 'items', $ItemId, 'jobs', $JobType, 'schedules')
            if ($ScheduleId) { $segments += $ScheduleId }
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No schedules returned for item '$ItemId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve the workspace display name once for all returned schedules.
            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($schedule in $response) {
                $schedule | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $schedule | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.ItemSchedule'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve schedules for item '$ItemId'. Error: $errorDetails" -Level Error
        }
    }
}
