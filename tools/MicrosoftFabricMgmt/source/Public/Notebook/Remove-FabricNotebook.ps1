<#
.SYNOPSIS
Deletes an Notebook from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricNotebook` function sends a DELETE request to the Fabric API to remove a specified Notebook from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Notebook to delete.

.PARAMETER NotebookId
(Mandatory) The ID of the Notebook to be deleted.

.EXAMPLE
Remove-FabricNotebook -WorkspaceId "12345" -NotebookId "67890"

Deletes the Notebook with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricNotebook {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$NotebookId
    )
    process {
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $NotebookId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "Notebook '$NotebookId' in workspace '$WorkspaceId'"
        $action = "Delete Notebook"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Notebook '$NotebookId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete notebook '$NotebookId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
    }
}
