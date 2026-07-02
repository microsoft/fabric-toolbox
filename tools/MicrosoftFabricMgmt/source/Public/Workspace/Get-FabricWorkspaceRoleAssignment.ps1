<#
.SYNOPSIS
Retrieves role assignments for a specified Fabric workspace.

.DESCRIPTION
The `Get-FabricWorkspaceRoleAssignments` function fetches the role assignments associated with a Fabric workspace by making a GET request to the API. If `WorkspaceRoleAssignmentId` is provided, it retrieves the specific role assignment.

.PARAMETER WorkspaceId
The unique identifier of the workspace to fetch role assignments for.

.PARAMETER WorkspaceRoleAssignmentId
(Optional) The unique identifier of a specific role assignment to retrieve.

.PARAMETER Raw
If specified, returns the untouched API response (including the full nested principal
object) with no added properties and no type decoration. By default the returned objects
include every API property plus resolved WorkspaceName/CapacityName and flattened
convenience fields (PrincipalId, DisplayName, Type, Role, etc.) for display.

.EXAMPLE
Get-FabricWorkspaceRoleAssignments -WorkspaceId "workspace123"

Fetches all role assignments for the workspace with the ID "workspace123".

.EXAMPLE
Get-FabricWorkspaceRoleAssignments -WorkspaceId "workspace123" -WorkspaceRoleAssignmentId "role123"

Fetches the role assignment with the ID "role123" for the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Get-FabricWorkspaceRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceRoleAssignmentId,

        [Parameter()]
        [switch]$Raw
    )
    process {

        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            # Correct pattern: /workspaces/{workspaceId}/roleAssignments
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'roleAssignments'

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Filter by role assignment id if provided. Pass -Raw so Select-FabricResource
            # does not attempt enrichment; roleAssignment items carry no workspaceId of their
            # own (the workspace comes from the -WorkspaceId parameter), so we enrich here.
            $matchedItems = Select-FabricResource -InputObject $dataItems -Id $WorkspaceRoleAssignmentId -ResourceType 'WorkspaceRoleAssignment' -Raw

            if (-not $matchedItems) {
                return
            }

            # -Raw returns the untouched API response (nested principal object preserved as-is).
            if ($Raw) {
                return $matchedItems
            }

            # Resolve workspace/capacity names once (shared by all assignments in this workspace).
            $workspaceName = $null
            try { $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId }
            catch { $workspaceName = $WorkspaceId }

            $capacityName = $null
            try {
                $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $WorkspaceId
                if ($capacityId) { $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId }
            }
            catch { $capacityName = $null }

            foreach ($obj in $matchedItems) {
                # Preserve every API property (including the full nested principal object) and
                # add workspace context plus flattened convenience fields used by the table view.
                $obj | Add-Member -NotePropertyName 'workspaceId'       -NotePropertyValue $WorkspaceId -Force
                $obj | Add-Member -NotePropertyName 'WorkspaceName'     -NotePropertyValue $workspaceName -Force
                if ($null -ne $capacityName) {
                    $obj | Add-Member -NotePropertyName 'CapacityName'  -NotePropertyValue $capacityName -Force
                }
                $obj | Add-Member -NotePropertyName 'ID'                -NotePropertyValue $obj.id -Force
                $obj | Add-Member -NotePropertyName 'PrincipalId'       -NotePropertyValue $obj.principal.id -Force
                $obj | Add-Member -NotePropertyName 'DisplayName'       -NotePropertyValue $obj.principal.displayName -Force
                $obj | Add-Member -NotePropertyName 'Type'              -NotePropertyValue $obj.principal.type -Force
                $obj | Add-Member -NotePropertyName 'UserPrincipalName' -NotePropertyValue $obj.principal.userDetails.userPrincipalName -Force
                $obj | Add-Member -NotePropertyName 'aadAppId'          -NotePropertyValue $obj.principal.servicePrincipalDetails.aadAppId -Force
                $obj | Add-Member -NotePropertyName 'Role'              -NotePropertyValue $obj.role -Force
            }

            $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.WorkspaceRoleAssignment'
            $matchedItems
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
