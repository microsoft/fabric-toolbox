<#
.SYNOPSIS
    Retrieves Apache Airflow Job details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets one or more Apache Airflow Job resources from a Microsoft Fabric workspace.
    You can filter by job ID or job name. Handles authentication, constructs the API endpoint,
    sends the request, and returns the matching job(s).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Apache Airflow Job(s). This parameter is mandatory.

.PARAMETER ApacheAirflowJobId
    (Optional) The unique identifier of the Apache Airflow Job to retrieve.

.PARAMETER ApacheAirflowJobName
    (Optional) The display name of the Apache Airflow Job to retrieve.

.EXAMPLE
    Get-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobId "job-67890"
    Retrieves the Apache Airflow Job with ID "job-67890" from the specified workspace.

.EXAMPLE
    Get-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobName "My Airflow Job"
    Retrieves the Apache Airflow Job named "My Airflow Job" from the specified workspace.

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.
    - Returns the matching job(s) or $null if not found.

    Author: Tiago Balabuch
#>
function Get-FabricApacheAirflowJob {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ApacheAirflowJobName
    )
    try {
        # Validate input parameters
        if ($ApacheAirflowJobId -and $ApacheAirflowJobName) {
            Write-FabricLog -Message "Specify only one parameter: either 'ApacheAirflowJobId' or 'ApacheAirflowJobName'." -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ApacheAirflowJobs'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering and output results
        Select-FabricResource -InputObject $dataItems -Id $ApacheAirflowJobId -DisplayName $ApacheAirflowJobName -ResourceType 'Apache Airflow Job'
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}
