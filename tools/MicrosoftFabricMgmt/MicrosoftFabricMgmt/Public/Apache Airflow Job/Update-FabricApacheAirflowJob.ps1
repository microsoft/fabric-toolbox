<#
.SYNOPSIS
    Updates an existing Apache Airflow Job in a Microsoft Fabric workspace.

.DESCRIPTION
    Updates the display name and optionally the description of an Apache Airflow Job within a specified Microsoft Fabric workspace.
    This function sends a PATCH request to the Microsoft Fabric API and requires a valid authentication token.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Apache Airflow Job.

.PARAMETER ApacheAirflowJobId
    The unique identifier of the Apache Airflow Job to update.

.PARAMETER ApacheAirflowJobName
    The new display name for the Apache Airflow Job.

.PARAMETER ApacheAirflowJobDescription
    An optional new description for the Apache Airflow Job.

.EXAMPLE
    Update-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobId "airflowjob-67890" -ApacheAirflowJobName "Updated Job Name" -ApacheAirflowJobDescription "Updated description"
    Updates the specified Apache Airflow Job with a new name and description.

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders` properties.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.
    - Author: Tiago Balabuch
#>
function Update-FabricApacheAirflowJob {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ApacheAirflowJobName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobDescription
    )
    try {
        # Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ApacheAirflowJobId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        
        # Construct the request body
        $body = @{
            displayName = $ApacheAirflowJobName
        }

        if ($ApacheAirflowJobDescription) {
            $body.description = $ApacheAirflowJobDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug
        
        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Apache Airflow Job '$ApacheAirflowJobName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}