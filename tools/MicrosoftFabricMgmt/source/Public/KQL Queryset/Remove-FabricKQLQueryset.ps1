<#
.SYNOPSIS
Deletes an KQLQueryset from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLQueryset` function sends a DELETE request to the Fabric API to remove a specified KQLQueryset from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLQueryset to delete.

.PARAMETER KQLQuerysetId
(Mandatory) The ID of the KQLQueryset to be deleted.

.EXAMPLE
Remove-FabricKQLQueryset -WorkspaceId "12345" -KQLQuerysetId "67890"

Deletes the KQLQueryset with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricKQLQueryset {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$KQLQuerysetId
    )
    process {
        try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'kqlQuerysets' -ItemId $KQLQuerysetId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($KQLQuerysetId, "Delete KQL Queryset in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLQueryset '$KQLQuerysetId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete KQLQueryset '$KQLQuerysetId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
