<#
.SYNOPSIS
    Removes an Apache Airflow Job from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function deletes an Apache Airflow Job from a Microsoft Fabric workspace by performing a DELETE request
    to the Fabric API. It requires the workspace and job identifiers, validates authentication, and handles errors.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Apache Airflow Job to be removed.

.PARAMETER ApacheAirflowJobId
    The unique identifier of the Apache Airflow Job to remove.

.EXAMPLE
    Remove-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobId "airflowjob-67890"
    Removes the Apache Airflow Job with ID "airflowjob-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the `$FabricConfig` global variable, which must include `BaseUrl` and `FabricHeaders`.
    - Validates authentication by calling `Test-TokenExpired` before making the API request.
    - Author: Tiago Balabuch
#>
function Remove-FabricApacheAirflowJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ApacheAirflowJobs' -ItemId $ApacheAirflowJobId

        if ($PSCmdlet.ShouldProcess("Apache Airflow Job '$ApacheAirflowJobId' in workspace '$WorkspaceId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Apache Airflow Job '$ApacheAirflowJobId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            $response
        }

    }
    catch {
        # Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Apache Airflow Job '$ApacheAirflowJobId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
