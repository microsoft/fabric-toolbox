<#
.SYNOPSIS
    Creates a new schedule for a job on a Microsoft Fabric item.

.DESCRIPTION
    The New-FabricItemSchedule function creates a schedule for a specific job type on a
    Fabric item via POST to
    /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules.

    Because the schedule configuration is polymorphic on its type (Cron, Daily, Weekly,
    MonthlyOnDates), the configuration is supplied as a hashtable and passed through
    verbatim so any schedule type can be expressed.

    The full created schedule object is returned. By default it is enriched with the
    originating WorkspaceId (stamped from the parameter), a resolved WorkspaceName, and
    decorated for the custom table view; pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item the schedule is created for. Mandatory.

.PARAMETER JobType
    The job type to schedule (e.g. 'RunNotebook', 'Pipeline', 'sparkjob', 'DefaultJob').
    Mandatory.

.PARAMETER Enabled
    Whether the schedule is enabled. Mandatory.

.PARAMETER Configuration
    A hashtable describing the polymorphic schedule configuration. Passed through verbatim.
    Example (Cron):
    @{ type = 'Cron'; startDateTime = '2024-04-28T00:00:00'; endDateTime = '2024-04-30T23:59:00'; localTimeZoneId = 'Central Standard Time'; interval = 10 }
    Example (Daily):
    @{ type = 'Daily'; startDateTime = '2024-04-28T00:00:00'; endDateTime = '2024-04-30T23:59:00'; localTimeZoneId = 'Central Standard Time'; times = @('09:00','17:00') }

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    $config = @{ type = 'Cron'; startDateTime = '2024-04-28T00:00:00'; endDateTime = '2024-04-30T23:59:00'; localTimeZoneId = 'Central Standard Time'; interval = 10 }
    New-FabricItemSchedule -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType 'RunNotebook' -Enabled $true -Configuration $config

    Creates an enabled Cron schedule for the notebook run job.

.OUTPUTS
    System.Object
    The created schedule object with all API-returned properties (plus WorkspaceName when enriched).

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/schedules
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function New-FabricItemSchedule {
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

        [Parameter(Mandatory = $true)]
        [bool]$Enabled,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Configuration,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'items', $ItemId, 'jobs', $JobType, 'schedules')
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # configuration is passed through verbatim so any schedule type's schema can be expressed.
            $body = @{
                enabled       = $Enabled
                configuration = $Configuration
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($ItemId, "Create Fabric item schedule")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after creating schedule for item '$ItemId'." -Level Warning
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
                Write-FabricLog -Message "Schedule for item '$ItemId' created successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create schedule for item '$ItemId'. Error: $errorDetails" -Level Error
        }
    }
}
