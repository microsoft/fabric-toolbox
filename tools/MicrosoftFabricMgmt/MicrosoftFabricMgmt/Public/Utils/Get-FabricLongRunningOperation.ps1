<#
.SYNOPSIS
Monitors the status of a long-running operation in Microsoft Fabric.

.DESCRIPTION
The Get-FabricLongRunningOperation function queries the Microsoft Fabric API to check the status of a 
long-running operation. It periodically polls the operation until it reaches a terminal state (Succeeded or Failed).

.PARAMETER operationId
The unique identifier of the long-running operation to be monitored.

.PARAMETER retryAfter
The interval (in seconds) to wait between polling the operation status. The default is 5 seconds.

.EXAMPLE
Get-FabricLongRunningOperation -operationId "12345-abcd-67890-efgh" -retryAfter 10

This command polls the status of the operation with the given operationId every 10 seconds until it completes.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.

.AUTHOR
Tiago Balabuch

#>
function Get-FabricLongRunningOperation { 
    param (
        [Parameter(Mandatory = $false)]
        [string]$operationId,
       
        [Parameter(Mandatory = $false)]
        [string]$location,

        [Parameter(Mandatory = $false)]
        [int]$retryAfter = 5,

        [Parameter(Mandatory = $false)]
        [int]$timeoutInSeconds = 900
    )

    if (-not ($operationId -or $location)) {
        throw "Either 'operationId' or 'location' parameter must be provided."
    }

    # Validate authentication token before proceeding.
    Write-Message -Message "Validating authentication token..." -Level Debug
    Test-TokenExpired
    Write-Message -Message "Authentication token is valid." -Level Debug
    
    # Construct the API endpoint URI 
    $apiEndpointURI = if ($operationId) {
        "https://api.fabric.microsoft.com/v1/operations/{0}" -f $operationId
    }
    else {
        $location 
    }
    Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

    $startTime = Get-Date

    try {
        do {
            # Check for timeout
            if ((Get-Date) - $startTime -gt (New-TimeSpan -Seconds $timeoutInSeconds)) {
                throw "Operation timed out after $timeoutInSeconds seconds."
            }

            # Wait before the next request
            Start-Sleep -Seconds $retryAfter

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Get'
            }
            $operation = Invoke-FabricAPIRequest @apiParams

            # Log status for debugging
            Write-Message -Message "Operation Status: $($operation.status)" -Level Debug

        } while ($operation.status -notin @("Succeeded", "Completed", "Failed"))

        # Return the operation result
        return $operation
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "An error occurred while checking the long running operation: $errorDetails" -Level Error
        throw
    }
}