<#
.SYNOPSIS
Provisions an identity for a Fabric workspace.

.DESCRIPTION
The `Add-FabricWorkspaceIdentity` function provisions an identity for a specified workspace by making an API call.

.PARAMETER WorkspaceId
The unique identifier of the workspace for which the identity will be provisioned.

.EXAMPLE
Add-FabricWorkspaceIdentity -WorkspaceId "workspace123"

Provisions a Managed Identity for the workspace with ID "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricWorkspaceIdentity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'provisionIdentity'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response.
        Write-FabricLog -Message "Workspace identity was successfully provisioned for workspace '$WorkspaceId'." -Level Info
        $response

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to provision workspace identity. Error: $errorDetails" -Level Error
    }
}
