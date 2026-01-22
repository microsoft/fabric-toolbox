<#
.SYNOPSIS
Deletes an Eventstream from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricEventstream` function sends a DELETE request to the Fabric API to remove a specified Eventstream from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Eventstream to delete.

.PARAMETER EventstreamId
(Mandatory) The ID of the Eventstream to be deleted.

.EXAMPLE
Remove-FabricEventstream -WorkspaceId "12345" -EventstreamId "67890"

Deletes the Eventstream with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>

function Remove-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$EventstreamId
    )

    process {
        try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Delete Eventstream in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Eventstream '$EventstreamId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
