<#
.SYNOPSIS
Assigns a Fabric workspace to a specified capacity.

.DESCRIPTION
The `Assign-FabricWorkspaceCapacity` function sends a POST request to assign a workspace to a specific capacity.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be assigned.

.PARAMETER CapacityId
The unique identifier of the capacity to which the workspace should be assigned.

.EXAMPLE
Assign-FabricWorkspaceCapacity -WorkspaceId "workspace123" -CapacityId "capacity456"

Assigns the workspace with ID "workspace123" to the capacity "capacity456".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  
#>

function Assign-FabricWorkspaceCapacity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/assignToCapacity" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            capacityId = $CapacityId
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
        Write-Message -Message "Successfully assigned workspace with ID '$WorkspaceId' to capacity with ID '$CapacityId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to assign workspace with ID '$WorkspaceId' to capacity with ID '$CapacityId'. Error: $errorDetails" -Level Error
    }
}
