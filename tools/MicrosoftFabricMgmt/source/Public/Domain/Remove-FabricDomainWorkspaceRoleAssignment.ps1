<#
.SYNOPSIS
Bulk unUnassign roles to principals for workspaces in a Fabric domain.

.DESCRIPTION
The `AssignFabricDomainWorkspaceRoleAssignment` function performs bulk role assignments for principals in a specific Fabric domain. It sends a POST request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the Fabric domain where roles will be assigned.

.PARAMETER DomainRole
The role to assign to the principals. Must be one of the following:
- `Admins`
- `Contributors`

.PARAMETER PrincipalIds
An array of principals to assign roles to. Each principal must include:
- `id`: The identifier of the principal.
- `type`: The type of the principal (e.g., `User`, `Group`).

.EXAMPLE
AssignFabricDomainWorkspaceRoleAssignment -DomainId "12345" -DomainRole "Admins" -PrincipalIds @(@{id="user1"; type="User"}, @{id="group1"; type="Group"})

Unassign the `Admins` role to the specified principals in the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Remove-FabricDomainWorkspaceRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Unassign-FabricDomainWorkspaceByRoleAssignment')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admins', 'Contributors')]
        [string]$DomainRole,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$PrincipalIds #Must contain a JSON array of principals with 'id' and 'type' properties
    )

    try {
        # Validate PrincipalIds structure
        # This uses a .NET HashSet to accelerate lookup even more, especially useful in large collections.
        foreach ($principal in $PrincipalIds) {
            if (-not ($principal.id -and $principal.type)) {
                throw "Each Principal must contain 'id' and 'type' properties. Found: $principal"
            }
        }

        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains', $DomainId, 'roleAssignments', 'bulkUnassign')
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            type       = $DomainRole
            principals = $PrincipalIds
        }
        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, "Unassign role '$DomainRole' from principals")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Bulk role unassignment for domain '$DomainId' completed successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to bulk assign roles in domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
