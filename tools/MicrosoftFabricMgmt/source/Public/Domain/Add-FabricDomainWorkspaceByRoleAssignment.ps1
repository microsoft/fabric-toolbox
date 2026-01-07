<#
.SYNOPSIS
Bulk assigns roles to principals for workspaces in a Fabric domain.

.DESCRIPTION
The `Add-FabricDomainWorkspaceByRoleAssignment` function performs bulk role assignments for principals in a specific Fabric domain. It sends a POST request to the relevant API endpoint.

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
Add-FabricDomainWorkspaceByRoleAssignment -DomainId "12345" -DomainRole "Admins" -PrincipalIds @(@{id="user1"; type="User"}, @{id="group1"; type="Group"})

Assigns the `Admins` role to the specified principals in the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricDomainWorkspaceByRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Assign-FabricDomainWorkspaceByRoleAssignment')]
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
        [System.Object]$PrincipalIds # Array with 'id' and 'type'
    )

    try {
        # Validate PrincipalIds structure
        foreach ($principal in $PrincipalIds) {
            if (-not ($principal.id -and $principal.type)) {
                throw "Each Principal must contain 'id' and 'type' properties. Found: $principal"
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/roleAssignments/bulkAssign" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            type       = $DomainRole
            principals = $PrincipalIds
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, "Assign role '$DomainRole' to principals")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Bulk role assignment for domain '$DomainId' completed successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to bulk assign roles in domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
