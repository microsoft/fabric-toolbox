<#
.SYNOPSIS
Deprovisions the Managed Identity for a specified Fabric workspace.

.DESCRIPTION
The `Remove-FabricWorkspaceCapacity` function deprovisions the Managed Identity from the given workspace by calling the appropriate API endpoint.

.PARAMETER WorkspaceId
The unique identifier of the workspace from which the identity will be removed.

.EXAMPLE
Remove-FabricWorkspaceCapacity -WorkspaceId "workspace123"

Deprovisions the Managed Identity for the workspace with ID "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Remove-FabricWorkspaceIdentity {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId
    )

    process {
        try {
            # Validate authentication token before proceeding.
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'deprovisionIdentity'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
            }

            if ($PSCmdlet.ShouldProcess("Workspace identity for '$WorkspaceId'", 'Deprovision')) {
                Invoke-FabricAPIRequest @apiParams

                # Return the API response
                Write-FabricLog -Message "Workspace identity was successfully deprovisioned for workspace '$WorkspaceId'." -Level Host
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to deprovision workspace identity. Error: $errorDetails" -Level Error
        }
    }
}
