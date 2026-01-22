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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ApacheAirflowJobId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('displayName')]
        [string]$ApacheAirflowJobName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('description')]
        [string]$ApacheAirflowJobDescription
    )

    process {
        try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Validate that at least one update parameter is provided
        if (-not $ApacheAirflowJobName -and -not $ApacheAirflowJobDescription) {
            Write-FabricLog -Message "At least one parameter (ApacheAirflowJobName or ApacheAirflowJobDescription) must be provided." -Level Error
            return
        }

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ApacheAirflowJobs' -ItemId $ApacheAirflowJobId

        # Construct the request body with only the properties that are provided
        $body = @{}

        if ($ApacheAirflowJobName) {
            $body.displayName = $ApacheAirflowJobName
        }

        if ($ApacheAirflowJobDescription) {
            $body.description = $ApacheAirflowJobDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        if ($PSCmdlet.ShouldProcess("Apache Airflow Job '$ApacheAirflowJobId' in workspace '$WorkspaceId'", "Update properties")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Apache Airflow Job '$ApacheAirflowJobName' updated successfully!" -Level Host
            $response
        }
    }
    catch {
            # Handle and log errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Apache Airflow Job. Error: $errorDetails" -Level Error
        }
    }
}
