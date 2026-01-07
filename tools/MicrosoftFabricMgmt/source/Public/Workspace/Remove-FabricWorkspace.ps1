<#
.SYNOPSIS
Deletes an existing Fabric workspace by its workspace ID.

.DESCRIPTION
The `Remove-FabricWorkspace` function deletes a workspace in the Fabric platform by sending a DELETE request to the API. It validates the workspace ID and handles both success and error responses.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be deleted.

.EXAMPLE
Remove-FabricWorkspace -WorkspaceId "workspace123"

Deletes the workspace with the ID "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Remove-FabricWorkspace {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'High')]
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
        $apiEndpointURI = "{0}/workspaces/{1}" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId'", 'Delete')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Workspace '$WorkspaceId' deleted successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve capacity. Error: $errorDetails" -Level Error
        return $null
    }
}
