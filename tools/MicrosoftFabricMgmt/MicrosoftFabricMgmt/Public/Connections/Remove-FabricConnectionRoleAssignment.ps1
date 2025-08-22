<#
.SYNOPSIS
Deletes a role assignment from a specified Fabric Connection.

.DESCRIPTION
Removes a role assignment from a Fabric Connection by sending a DELETE request to the Fabric API.

.PARAMETER ConnectionId
Specifies the unique identifier of the Fabric Connection.

.PARAMETER ConnectionRoleAssignmentId
Specifies the unique identifier of the role assignment to remove.

.EXAMPLE
Remove-FabricConnectionRoleAssignment -ConnectionId "Connection123" -ConnectionRoleAssignmentId "role123"

Removes the role assignment "role123" from the connection "Connection123".

.NOTES
Requires the global `$FabricConfig` object with `BaseUrl` and `FabricHeaders`.
Validates authentication using `Test-TokenExpired` before making the API call.

Author: Tiago Balabuch
#>

function Remove-FabricConnectionRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionRoleAssignmentId
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}/roleAssignments/{2}" -f $FabricConfig.BaseUrl, $ConnectionId, $ConnectionRoleAssignmentId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response        
        Write-Message -Message "Role assignment '$ConnectionRoleAssignmentId' successfully removed from Connection '$ConnectionId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to remove role assignments for ConnectionId '$ConnectionId'. Error: $errorDetails" -Level Error
    }
}
