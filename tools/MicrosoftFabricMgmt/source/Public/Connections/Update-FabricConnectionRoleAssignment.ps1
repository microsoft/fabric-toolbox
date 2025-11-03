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
#>

function Update-FabricConnectionRoleAssignment {
    [CmdletBinding()]
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
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}/roleAssignments/{2}" -f $FabricConfig.BaseUrl, $ConnectionId, $ConnectionRoleAssignmentId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            role = $ConnectionRole
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4 -Compress
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response      
        Write-Message -Message "Role assignment $ConnectionRoleAssignmentId updated successfully in Connection '$ConnectionId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update role assignment. Error: $errorDetails" -Level Error
    }
}
