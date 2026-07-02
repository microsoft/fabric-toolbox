<#
.SYNOPSIS
    Retrieves job instances for a Microsoft Fabric item.

.DESCRIPTION
    The Get-FabricItemJobInstance function retrieves the job instances that have run (or are
    running) for a Fabric item.

    When -JobInstanceId is supplied it returns the single matching instance via
    /workspaces/{workspaceId}/items/{itemId}/jobs/instances/{jobInstanceId}; otherwise it
    lists all instances via /workspaces/{workspaceId}/items/{itemId}/jobs/instances.
    Note that the list/get instance endpoints do not include a jobType segment.

    By default each returned object is enriched with the originating WorkspaceId (stamped
    from the parameter) and a resolved WorkspaceName, and decorated for the custom table
    view. Pass -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item whose job instances are retrieved. Mandatory.

.PARAMETER JobInstanceId
    Optional. The unique identifier of a single job instance to retrieve.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricItemJobInstance -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists all job instances for the item, enriched with WorkspaceName.

.EXAMPLE
    Get-FabricItemJobInstance -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobInstanceId "inst-1"

    Returns the single job instance with that ID.

.OUTPUTS
    System.Object
    Job instance object(s) with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoints:
        GET /workspaces/{workspaceId}/items/{itemId}/jobs/instances
        GET /workspaces/{workspaceId}/items/{itemId}/jobs/instances/{jobInstanceId}
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Get-FabricItemJobInstance {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$JobInstanceId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # No jobType segment here; append JobInstanceId only when a single instance is requested.
            $segments = @('workspaces', $WorkspaceId, 'items', $ItemId, 'jobs', 'instances')
            if ($JobInstanceId) { $segments += $JobInstanceId }
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No job instances returned for item '$ItemId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Resolve the workspace display name once for all returned instances.
            $workspaceName = $WorkspaceId
            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
            }
            catch {
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
            }

            foreach ($instance in $response) {
                $instance | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $instance | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.ItemJobInstance'
            $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve job instances for item '$ItemId'. Error: $errorDetails" -Level Error
        }
    }
}
