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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CopyJobId
    )

    process {
        try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'copyJobs' -ItemId $CopyJobId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("Copy Job '$CopyJobId' in workspace '$WorkspaceId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Copy Job '$CopyJobId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            $response
        }

    }
    catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Copy Job '$CopyJobId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
