<#
.SYNOPSIS
Polls and returns the final status of a Fabric long-running operation.

.DESCRIPTION
The Get-FabricLongRunningOperation cmdlet repeatedly queries a Fabric long-running operation endpoint until the
operation reaches a terminal state (Succeeded, Completed, or Failed) or a timeout is exceeded. You can supply either
the operationId (preferred) or a full location URL returned by a prior asynchronous API call.

.PARAMETER operationId
The GUID identifying the long-running operation. Provide this when the previous API response returned an operationId.
If specified, the cmdlet constructs the operation status URL automatically.

.PARAMETER location
The full operation status URL (Location header) returned by some asynchronous Fabric API responses. Use this only when
an operationId was not provided, or you captured the raw Location header directly.

.PARAMETER retryAfter
The number of seconds to wait between status polls. Increasing this reduces API calls at the cost of slower feedback.
Defaults to 5 seconds which balances responsiveness with request volume.

.PARAMETER timeoutInSeconds
Maximum number of seconds to wait before aborting with a timeout error. The default of 900 seconds (15 minutes) helps
prevent indefinite polling if the service stops updating status.

.EXAMPLE
Get-FabricLongRunningOperation -operationId "12345-abcd-67890-efgh" -retryAfter 10 -timeoutInSeconds 1200

Polls the specified operation every 10 seconds for up to 20 minutes before timing out.

.EXAMPLE
Get-FabricLongRunningOperation -location "https://api.fabric.microsoft.com/v1/operations/12345-abcd/status" -retryAfter 3

Uses a raw location URL to track an operation, polling every 3 seconds.

.NOTES
Either operationId or location must be provided (but not both). Token validity is validated before polling.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026


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
    Write-FabricLog -Message "Validating authentication token..." -Level Debug
    Test-TokenExpired
    Write-FabricLog -Message "Authentication token is valid." -Level Debug

    # Construct the API endpoint URI
    $apiEndpointURI = if ($operationId) {
        "https://api.fabric.microsoft.com/v1/operations/{0}" -f $operationId
    }
    else {
        $location
    }
    Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

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
            Write-FabricLog -Message "Operation Status: $($operation.status)" -Level Debug

        } while ($operation.status -notin @("Succeeded", "Completed", "Failed"))

        # Return the operation result
        return $operation
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "An error occurred while checking the long running operation: $errorDetails" -Level Error
        throw
    }
}
