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
    Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Start-FabricSparkJobDefinitionOnDemand {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('sparkjob')]
        [string]$JobType = "sparkjob",

        [Parameter(Mandatory = $false)]
        [switch]$WaitForCompletion
    )
    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/SparkJobDefinitions/{2}/jobs/instances?jobType={3}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId , $SparkJobDefinitionId, $JobType
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 4: Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Job Definition '$SparkJobDefinitionId' in workspace '$WorkspaceId'", "Start")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            if ($WaitForCompletion.IsPresent) {
                $apiParams.WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($WaitForCompletion) {
                Write-FabricLog -Message "On-demand Spark Job Definition (ID: '$SparkJobDefinitionId') has completed." -Level Host
                Write-FabricLog -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
            }
            else {
                Write-FabricLog -Message "Successfully started on-demand Spark Job Definition (ID: '$SparkJobDefinitionId') in workspace '$WorkspaceId'. and is running asynchronously." -Level Host
                Write-FabricLog -Message "You can monitor the job status using the job ID from the response." -Level Debug
            }

            # Return the API response
            #Write-FabricLog -Message "Successfully started on-demand Spark Job Definition (ID: '$SparkJobDefinitionId') in workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to start Spark Job Definition on demand. Error: $errorDetails" -Level Error
        }
    }
}
