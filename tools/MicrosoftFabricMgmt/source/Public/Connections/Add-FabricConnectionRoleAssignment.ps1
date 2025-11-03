<#
.SYNOPSIS
Assigns a specified role to a principal for a Fabric Connection.

.DESCRIPTION
The Add-FabricConnectionRoleAssignment function assigns a role (User, UserWithReshare, Owner) to a principal (User, Group, ServicePrincipal, ServicePrincipalProfile) in a Fabric Connection by sending a POST request to the Fabric API.

.PARAMETER ConnectionId
The unique identifier of the Fabric Connection.

.PARAMETER PrincipalId
The unique identifier of the principal to assign the role to.

.PARAMETER PrincipalType
The type of principal. Valid values: Group, ServicePrincipal, ServicePrincipalProfile, User.

.PARAMETER ConnectionRole
The role to assign. Valid values: User, UserWithReshare, Owner.

.EXAMPLE
Add-FabricConnectionRoleAssignment -ConnectionId "abc123" -PrincipalId "user456" -PrincipalType "User" -ConnectionRole "Owner"

Assigns the Owner role to the user with ID "user456" in the connection "abc123".

.NOTES
- Requires $FabricConfig with BaseUrl and FabricHeaders.
- Validates authentication token using Test-TokenExpired before making the API call.
#>

function Add-FabricConnectionRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$PrincipalId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Group', 'ServicePrincipal', 'ServicePrincipalProfile', 'User')]
        [string]$PrincipalType,

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
        $apiEndpointURI = "{0}/connections/{1}/roleAssignments" -f $FabricConfig.BaseUrl, $ConnectionId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            principal = @{
                id   = $PrincipalId
                type = $PrincipalType
            }
            role      = $ConnectionRole
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Role '$ConnectionRole' assigned to principal '$PrincipalId' successfully in connection '$ConnectionId'." -Level Info
        return $response        
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to assign role. Error: $errorDetails" -Level Error
    }
}
