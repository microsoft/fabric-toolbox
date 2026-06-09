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
If specified, returns the raw API response without type decoration.

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

        # Apply filtering
        $matchedItems = Select-FabricResource -InputObject $dataItems -Id $WorkspaceRoleAssignmentId -ResourceType 'WorkspaceRoleAssignment'

        # Transform data into custom objects with type decoration
        if ($matchedItems) {
            $customResults = foreach ($obj in $matchedItems) {
                [PSCustomObject]@{
                    workspaceId       = $WorkspaceId  # Add workspaceId for formatting
                    ID                = $obj.id
                    PrincipalId       = $obj.principal.id
                    DisplayName       = $obj.principal.displayName
                    Type              = $obj.principal.type
                    UserPrincipalName = $obj.principal.userDetails.userPrincipalName
                    aadAppId          = $obj.principal.servicePrincipalDetails.aadAppId
                    Role              = $obj.role
                }
            }

            if ($Raw) {
                # Add resolved names directly to objects
                foreach ($item in $customResults) {
                    # Resolve WorkspaceName
                    $workspaceName = $null
                    if ($item.workspaceId) {
                        try {
                            $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $item.workspaceId
                        }
                        catch {
                            $workspaceName = $item.workspaceId
                        }
                    }

                    # Resolve CapacityName via workspace
                    $capacityName = $null
                    if ($item.workspaceId) {
                        try {
                            $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $item.workspaceId
                            if ($capacityId) {
                                $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
                            }
                        }
                        catch {
                            $capacityName = $null
                        }
                    }

                    if ($null -ne $workspaceName) {
                        $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
                    }
                    if ($null -ne $capacityName) {
                        $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
                    }
                }
            }
            else {
                # Add type decoration for custom formatting
                $customResults | Add-FabricTypeName -TypeName 'MicrosoftFabric.WorkspaceRoleAssignment'
            }

            return $customResults
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
