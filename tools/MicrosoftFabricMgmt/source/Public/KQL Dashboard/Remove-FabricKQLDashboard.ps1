<#
.SYNOPSIS
Deletes an KQLDashboard from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLDashboard` function sends a DELETE request to the Fabric API to remove a specified KQLDashboard from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLDashboard to delete.

.PARAMETER KQLDashboardId
(Mandatory) The ID of the KQLDashboard to be deleted.

.EXAMPLE
Remove-FabricKQLDashboard -WorkspaceId "12345" -KQLDashboardId "67890"

Deletes the KQLDashboard with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricKQLDashboard {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$KQLDashboardId
    )
    process {
        try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'kqlDashboards' -ItemId $KQLDashboardId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($KQLDashboardId, "Delete KQL Dashboard in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDashboard '$KQLDashboardId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete KQLDashboard '$KQLDashboardId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
