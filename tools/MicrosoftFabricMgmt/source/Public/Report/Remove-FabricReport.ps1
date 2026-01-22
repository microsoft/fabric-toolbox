<#
.SYNOPSIS
    Removes an Report from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an Report
    from the specified workspace using the provided WorkspaceId and ReportId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Report will be removed.

.PARAMETER ReportId
    The unique identifier of the Report to be removed.

.EXAMPLE
    Remove-FabricReport -WorkspaceId "workspace-12345" -ReportId "Report-67890"
    This example removes the Report with ID "Report-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricReport {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ReportId
    )
    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/reports/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ReportId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            ## Make the API request
            if ($PSCmdlet.ShouldProcess("Report '$ReportId' in workspace '$WorkspaceId'", "Remove")) {
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                # Return the API response
                Write-FabricLog -Message "Report '$ReportId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                return $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Report '$ReportId'. Error: $errorDetails" -Level Error
        }
    }
}
