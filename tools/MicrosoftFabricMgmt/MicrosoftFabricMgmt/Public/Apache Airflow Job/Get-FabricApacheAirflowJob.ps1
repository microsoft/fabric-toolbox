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
            Write-Message -Message "Specify only one parameter: either 'ApacheAirflowJobId' or 'ApacheAirflowJobName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
  
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
  
        # Apply filtering logic efficiently
        if ($ApacheAirflowJobId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ApacheAirflowJobId }, 'First')
        }
        elseif ($ApacheAirflowJobName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ApacheAirflowJobName }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }
  
        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Apache Airflow Job. Error: $errorDetails" -Level Error
    } 
}