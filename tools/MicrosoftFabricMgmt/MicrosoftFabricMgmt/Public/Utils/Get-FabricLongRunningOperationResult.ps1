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
    # Validate authentication token before proceeding.
    Write-Message -Message "Validating authentication token..." -Level Debug
    Test-TokenExpired
    Write-Message -Message "Authentication token is valid." -Level Debug
        
    # Construct the API endpoint URI
    $apiEndpointURI = "https://api.fabric.microsoft.com/v1/operations/{0}/result" -f $operationId
    Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

    try {
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "LRO result return: $($response)" -Level Debug
        return $response 
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "An error occurred while returning the operation result: $errorDetails" -Level Error
        throw
    }
}