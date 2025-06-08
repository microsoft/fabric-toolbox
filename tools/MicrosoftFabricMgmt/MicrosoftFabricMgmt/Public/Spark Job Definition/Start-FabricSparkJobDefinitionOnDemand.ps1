<#
.SYNOPSIS
    Starts a Fabric Spark Job Definition on demand.

.DESCRIPTION
    This function initiates a Spark Job Definition on demand within a specified workspace. 
    It constructs the appropriate API endpoint URL and makes a POST request to start the job.
    The function can optionally wait for the job to complete based on the 'waitForCompletion' parameter.

.PARAMETER WorkspaceId
    The ID of the workspace where the Spark Job Definition is located. This parameter is mandatory.

.PARAMETER SparkJobDefinitionId
    The ID of the Spark Job Definition to be started. This parameter is mandatory.

.PARAMETER JobType
    The type of job to be started. The default value is 'sparkjob'. This parameter is optional.

.PARAMETER waitForCompletion
    A boolean flag indicating whether to wait for the job to complete. The default value is $false. This parameter is optional.

.EXAMPLE
    Start-FabricSparkJobDefinitionOnDemand -WorkspaceId "workspace123" -SparkJobDefinitionId "jobdef456" -waitForCompletion $true

.NOTES
    Ensure that the necessary authentication tokens are valid before running this function.
    The function logs detailed messages for debugging and informational purposes.
#>
function Start-FabricSparkJobDefinitionOnDemand {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('sparkjob')]
        [string]$JobType = "sparkjob",

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$waitForCompletion = $false
    )
    try { 
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/SparkJobDefinitions/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $SparkJobDefinitionId, $JobType
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post `
            -Body $bodyJson `
            -WaitForCompletion $waitForCompletion `
            -HasResults $false

        # Return the API response  
        Write-Message -Message "Successfully started on-demand Spark Job Definition (ID: '$SparkJobDefinitionId') in workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to start Spark Job Definition on demand. Error: $errorDetails" -Level Error
    }
}