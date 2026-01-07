<#
.SYNOPSIS
Unassigns a Fabric workspace from its capacity.

.DESCRIPTION
The `Remove-FabricWorkspaceCapacity` function sends a POST request to unassign a workspace from its assigned capacity.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be unassigned from its capacity.

.EXAMPLE
Remove-FabricWorkspaceCapacity -WorkspaceId "workspace123"

Unassigns the workspace with ID "workspace123" from its capacity.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Remove-FabricWorkspaceCapacity {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/unassignFromCapacity" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("$WorkspaceId" , "Remove from Capacity")) {
            # Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post
        }


        # Return the API response
        Write-FabricLog -Message "Workspace capacity has been successfully unassigned from workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to unassign workspace from capacity. Error: $errorDetails" -Level Error
    }
}
