<#
.SYNOPSIS
    Removes an Eventhouse from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an Eventhouse
    from the specified workspace using the provided WorkspaceId and EventhouseId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Eventhouse will be removed.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to be removed.

.EXAMPLE
     Remove-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example removes the Eventhouse with ID "eventhouse-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricEventhouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$EventhouseId
    )
    process {
        try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "eventhouses/$EventhouseId"

        if ($PSCmdlet.ShouldProcess($EventhouseId, "Delete Eventhouse in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventhouse '$EventhouseId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            $response
        }

    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Eventhouse '$EventhouseId'. Error: $errorDetails" -Level Error
        }
    }
}
