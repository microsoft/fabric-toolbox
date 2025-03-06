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
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        
        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/SparkJobDefinitions/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $SparkJobDefinitionId, $JobType
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Post `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        Write-Message -Message "Response Code: $statusCode" -Level Debug    
        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-Message -Message "Spark Job Definition on demand successfully initiated for SparkJobDefinition '$SparkJobDefinition.displayName'." -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Spark Job Definition on demand accepted and is now running in the background. Job execution is in progress." -Level Info
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                [string]$retryAfter = $responseHeader["Retry-After"] 

                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Location: '$location'" -Level Debug
                Write-Message -Message "Retry-After: '$retryAfter'" -Level Debug
               
                if ($waitForCompletion -eq $true) {
                    Write-Message -Message "Getting Long Running Operation status" -Level Debug               
                    $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location -retryAfter $retryAfter
                    Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug
                    return $operationStatus
                }
                else {
                    Write-Message -Message "The operation is running asynchronously." -Level Info
                    Write-Message -Message "Use the returned details to check the operation status." -Level Info
                    Write-Message -Message "To wait for the operation to complete, set the 'waitForCompletion' parameter to true." -Level Info  
                    $operationDetails = [PSCustomObject]@{
                        OperationId = $operationId
                        Location    = $location
                        RetryAfter  = $retryAfter
                    }
                    return $operationDetails
                }
            }
            default {
                Write-Message -Message "Unexpected response code: $statusCode" -Level Error
                Write-Message -Message "Error details: $($response.message)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to start Spark Job Definition on demand. Error: $errorDetails" -Level Error
    }
}
