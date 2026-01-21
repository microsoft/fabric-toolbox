<#
.SYNOPSIS
Deletes an KQLDatabase from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLDatabase` function sends a DELETE request to the Fabric API to remove a specified KQLDatabase from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLDatabase to delete.

.PARAMETER KQLDatabaseId
(Mandatory) The ID of the KQLDatabase to be deleted.

.EXAMPLE
Remove-FabricKQLDatabase -WorkspaceId "12345" -KQLDatabaseId "67890"

Deletes the KQLDatabase with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricKQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$KQLDatabaseId
    )

    process {
        try{
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'kqlDatabases' -ItemId $KQLDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($KQLDatabaseId, "Delete KQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDatabase '$KQLDatabaseId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete KQLDatabase '$KQLDatabaseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
