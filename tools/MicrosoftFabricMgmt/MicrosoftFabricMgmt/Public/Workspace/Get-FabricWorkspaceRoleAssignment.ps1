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
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceRoleAssignmentId
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
    
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/roleAssignments" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
             
        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
        
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($WorkspaceRoleAssignmentId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $WorkspaceRoleAssignmentId })
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Found $($matchedItems.Count) role assignments for WorkspaceId '$WorkspaceId'." -Level Debug
            
            # Transform data into custom objects
            $customResults = foreach ($obj in $matchedItems) {
                [PSCustomObject]@{
                    ID                = $obj.id
                    PrincipalId       = $obj.principal.id
                    DisplayName       = $obj.principal.displayName
                    Type              = $obj.principal.type
                    UserPrincipalName = $obj.principal.userDetails.userPrincipalName
                    aadAppId          = $obj.principal.servicePrincipalDetails.aadAppId
                    Role              = $obj.role
                }
            }
            return $customResults
        }
        else {
            if ($WorkspaceRoleAssignmentId) {
                Write-Message -Message "No role assignment found with ID '$WorkspaceRoleAssignmentId' for WorkspaceId '$WorkspaceId'." -Level Warning
                return $null
            }
            else {
                Write-Message -Message "No role assignments found for WorkspaceId '$WorkspaceId'." -Level Warning
                return $null
            }
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
