<#
.SYNOPSIS
Updates the role assignment for a principal in a Fabric Connection.

.DESCRIPTION
Updates the assigned role for a specific principal in a Fabric Connection using a PATCH API request.

.PARAMETER ConnectionId
Specifies the Connection identifier.

.PARAMETER ConnectionRoleAssignmentId
Specifies the role assignment identifier to update.

.PARAMETER ConnectionRole
Specifies the new role to assign. Valid values: User, UserWithReshare, Owner.

.EXAMPLE
Update-FabricConnectionRoleAssignment -ConnectionId "Connection123" -ConnectionRoleAssignmentId "assignment456" -ConnectionRole "Owner"

.NOTES
Requires global $FabricConfig with BaseUrl and FabricHeaders.
Validates authentication token before request.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Update-FabricConnectionRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionRoleAssignmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('User', 'UserWithReshare', 'Owner')]
        [string]$ConnectionRole
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'connections' -ItemId $ConnectionId -Subresource 'roleAssignments'
        $apiEndpointURI = "$apiEndpointURI/$ConnectionRoleAssignmentId"

        # Construct the request body
        $body = @{
            role = $ConnectionRole
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        if ($PSCmdlet.ShouldProcess("Role assignment '$ConnectionRoleAssignmentId' on Connection '$ConnectionId'", "Update role to '$ConnectionRole'")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Role assignment $ConnectionRoleAssignmentId updated successfully in Connection '$ConnectionId'." -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update role assignment. Error: $errorDetails" -Level Error
    }
}
