<#
.SYNOPSIS
    Removes an Reflex from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an Reflex
    from the specified workspace using the provided WorkspaceId and ReflexId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Reflex will be removed.

.PARAMETER ReflexId
    The unique identifier of the Reflex to be removed.

.EXAMPLE
    Remove-FabricReflex -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890"
    This example removes the Reflex with ID "Reflex-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricReflex {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ReflexId
    )
    process {
        try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ReflexId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Reflex '$ReflexId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Reflex '$ReflexId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Reflex '$ReflexId'. Error: $errorDetails" -Level Error
        }
    }
}
