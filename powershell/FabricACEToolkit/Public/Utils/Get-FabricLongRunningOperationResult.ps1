<#
.SYNOPSIS
Retrieves the result of a completed long-running operation from the Microsoft Fabric API.

.DESCRIPTION
The Get-FabricLongRunningOperationResult function queries the Microsoft Fabric API to fetch the result 
of a specific long-running operation. This is typically used after confirming the operation has completed successfully.

.PARAMETER operationId
The unique identifier of the completed long-running operation whose result you want to retrieve.

.EXAMPLE
Get-FabricLongRunningOperationResult -operationId "12345-abcd-67890-efgh"

This command fetches the result of the operation with the specified operationId.

.NOTES
- Ensure the Fabric API headers (e.g., authorization tokens) are defined in $FabricConfig.FabricHeaders.
- This function does not handle polling. Ensure the operation is in a terminal state before calling this function.

.AUTHOR
Tiago Balabuch

#>
function Get-FabricLongRunningOperationResult {
    param (
        [Parameter(Mandatory = $true)]
        [string]$operationId
    )

    # Step 1: Construct the API URL
    $apiEndpointUrl = "https://api.fabric.microsoft.com/v1/operations/{0}/result" -f $operationId
    Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

    try {
        # Step 2: Make the API request
        $response = Invoke-RestMethod `
        -Headers $FabricConfig.FabricHeaders `
        -Uri $apiEndpointUrl `
        -Method Get `
        -ErrorAction Stop `
        -SkipHttpErrorCheck `
        -ResponseHeadersVariable "responseHeader" `
        -StatusCodeVariable "statusCode"
        

        # Step 3: Return the result
        Write-Message -Message "Result response code: $statusCode" -Level Debug
        Write-Message -Message "Result return: $response" -Level Debug

        # Step 4: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Debug
            Write-Message -Message "Error: $($response.message)" -Level Debug
            Write-Message -Message "Error Details: $($response.moreDetails)" -Level Debug
            Write-Message "Error Code: $($response.errorCode)" -Level Debug
        }

        return $response 
    }
    catch {
        # Step 3: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "An error occurred while returning the operation result: $errorDetails" -Level Error
        throw
    }
}