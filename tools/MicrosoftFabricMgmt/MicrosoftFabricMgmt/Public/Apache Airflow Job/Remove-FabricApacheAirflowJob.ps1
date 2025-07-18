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
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ApacheAirflowJobId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

             # Return the API response   
        Write-Message -Message "Apache Airflow Job '$ApacheAirflowJobId' deleted successfully from workspace '$WorkspaceId'." -Level Info
        return $response

    }
    catch {
        # Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Apache Airflow Job '$ApacheAirflowJobId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}