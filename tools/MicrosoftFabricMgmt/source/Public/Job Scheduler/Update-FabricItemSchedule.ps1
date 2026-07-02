<#
.SYNOPSIS
    Updates an existing job schedule on a Microsoft Fabric item.

.DESCRIPTION
    The Update-FabricItemSchedule function updates a schedule for a specific job type on a
    Fabric item via PATCH to
    /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules/{scheduleId}.

    Only the fields that are supplied are sent in the request body. The schedule
    configuration is polymorphic and, when provided, is passed through verbatim as a
    hashtable so any schedule type can be expressed.

    The full updated schedule object is returned. By default it is enriched with the
    originating WorkspaceId (stamped from the parameter), a resolved WorkspaceName, and
    decorated for the custom table view; pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item whose schedule is updated. Mandatory.

.PARAMETER JobType
    The job type of the schedule (e.g. 'RunNotebook', 'Pipeline'). Mandatory.

.PARAMETER ScheduleId
    The unique identifier of the schedule to update. Mandatory.

.PARAMETER Enabled
    Optional. Whether the schedule is enabled. Only included in the request when supplied.

.PARAMETER Configuration
    Optional. A hashtable describing the polymorphic schedule configuration. Passed through
    verbatim. Only included in the request when supplied.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Update-FabricItemSchedule -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType 'RunNotebook' -ScheduleId "sched-1" -Enabled $false

    Disables the schedule without altering its configuration.

.EXAMPLE
    $config = @{ type = 'Daily'; startDateTime = '2024-04-28T00:00:00'; endDateTime = '2024-04-30T23:59:00'; localTimeZoneId = 'Central Standard Time'; times = @('09:00') }
    Update-FabricItemSchedule -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType 'RunNotebook' -ScheduleId "sched-1" -Configuration $config

    Replaces the schedule configuration with a daily schedule.

.OUTPUTS
    System.Object
    The updated schedule object with all API-returned properties (plus WorkspaceName when enriched).

.NOTES
    - API Endpoint: PATCH /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules/{scheduleId}
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricItemSchedule {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        [string]$ScheduleId,

        [Parameter(Mandatory = $false)]
        [bool]$Enabled,

        [Parameter(Mandatory = $false)]
        [hashtable]$Configuration,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'items', $ItemId, 'jobs', $JobType, 'schedules', $ScheduleId)
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Only include supplied fields in the request body.
            $body = @{}
            if ($PSBoundParameters.ContainsKey('Enabled')) { $body.enabled = $Enabled }
            if ($PSBoundParameters.ContainsKey('Configuration')) { $body.configuration = $Configuration }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($ScheduleId, "Update Fabric item schedule")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after updating schedule '$ScheduleId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                # Enrich: stamp the originating workspace id and resolve its display name.
                $response | Add-Member -NotePropertyName 'workspaceId' -NotePropertyValue $WorkspaceId -Force
                $workspaceName = $WorkspaceId
                try {
                    $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
                }
                catch {
                    Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
                }
                $response | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.ItemSchedule'
                Write-FabricLog -Message "Schedule '$ScheduleId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update schedule '$ScheduleId'. Error: $errorDetails" -Level Error
        }
    }
}
