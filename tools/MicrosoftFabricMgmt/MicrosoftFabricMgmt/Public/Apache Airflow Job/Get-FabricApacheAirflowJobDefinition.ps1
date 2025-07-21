<#
.SYNOPSIS
Retrieves the definition of a Apache Airflow Job from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the Apache Airflow Job's content or metadata from a workspace. 
It supports both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the Apache Airflow Job definition is to be retrieved.

.PARAMETER ApacheAirflowJobId
(Mandatory) The unique identifier of the Apache Airflow Job whose definition needs to be retrieved.

.PARAMETER ApacheAirflowJobFormat
(Optional) Specifies the format of the Apache Airflow Job definition. For example, 'json' or 'xml'.

.EXAMPLE
Get-FabricCopyJobDefinition -WorkspaceId "12345" -ApacheAirflowJobId "67890"

Retrieves the definition of the Apache Airflow Job with ID `67890` from the workspace with ID `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
- Logs detailed information for debugging purposes.

#>
function Get-FabricApacheAirflowJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ApacheAirflowJobId

        # Append the format query parameter if specified by the user.
        if ($ApacheAirflowJobFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $ApacheAirflowJobFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Apache Airflow Job definition. Error: $errorDetails" -Level Error
    } 
}