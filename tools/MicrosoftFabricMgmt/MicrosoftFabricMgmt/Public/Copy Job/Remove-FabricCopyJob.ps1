<#
.SYNOPSIS
    Deletes a Copy Job from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Copy Job 
    from the specified workspace using the provided WorkspaceId and CopyJobId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Copy Job to be deleted.

.PARAMETER CopyJobId
    The unique identifier of the Copy Job to delete.

.EXAMPLE
    Remove-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobId "copyjob-67890"
    Deletes the Copy Job with ID "copyjob-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the `$FabricConfig` global configuration, which must include `BaseUrl` and `FabricHeaders`.
    - Ensures token validity by invoking `Test-TokenExpired` before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricCopyJob {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $CopyJobId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        Write-Message -Message "Copy Job '$CopyJobId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response

    }
    catch {
        # Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Copy Job '$CopyJobId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}