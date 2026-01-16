<#
.SYNOPSIS
Retrieves role assignments for a specified Fabric workspace.

.DESCRIPTION
The `Get-FabricWorkspaceRoleAssignments` function fetches the role assignments associated with a Fabric workspace by making a GET request to the API. If `WorkspaceRoleAssignmentId` is provided, it retrieves the specific role assignment.

.PARAMETER WorkspaceId
The unique identifier of the workspace to fetch role assignments for.

.PARAMETER WorkspaceRoleAssignmentId
(Optional) The unique identifier of a specific role assignment to retrieve.

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
        [string]$WorkspaceRoleAssignmentId
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

            # Add type decoration for custom formatting
            $customResults | Add-FabricTypeName -TypeName 'MicrosoftFabric.WorkspaceRoleAssignment'

            return $customResults
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
