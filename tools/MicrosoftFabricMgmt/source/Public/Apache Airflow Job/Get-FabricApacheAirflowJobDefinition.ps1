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
Get-FabricApacheAirflowJobDefinition -WorkspaceId "12345" -ApacheAirflowJobId "67890"

Retrieves the definition of the Apache Airflow Job with ID `67890` from the workspace with ID `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
- Logs detailed information for debugging purposes.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
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
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $queryParams = if ($ApacheAirflowJobFormat) {
            @{ format = $ApacheAirflowJobFormat }
        } else {
            $null
        }

        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ApacheAirflowJobs' -ItemId $ApacheAirflowJobId
        $apiEndpointURI = "$apiEndpointURI/getDefinition"

        if ($queryParams) {
            $queryString = ($queryParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '&'
            $apiEndpointURI = "$apiEndpointURI`?$queryString"
        }

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Post'
        }
        Invoke-FabricAPIRequest @apiParams
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Apache Airflow Job definition. Error: $errorDetails" -Level Error
    }
}
