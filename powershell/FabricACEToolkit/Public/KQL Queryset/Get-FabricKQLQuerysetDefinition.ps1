
<#
.SYNOPSIS
Retrieves the definition of a KQLQueryset from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the KQLQueryset's content or metadata from a workspace. 
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the KQLQueryset definition is to be retrieved.

.PARAMETER KQLQuerysetId
(Optional)The unique identifier of the KQLQueryset whose definition needs to be retrieved.

.PARAMETER KQLQuerysetFormat
Specifies the format of the KQLQueryset definition.

.EXAMPLE
Get-FabricKQLQuerysetDefinition -WorkspaceId "12345" -KQLQuerysetId "67890"

Retrieves the definition of the KQLQueryset with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricKQLQuerysetDefinition -WorkspaceId "12345"

Retrieves the definitions of all KQLQuerysets in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

#>
function Get-FabricKQLQuerysetDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetFormat
    )

    try {
        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 3: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/kqlQuerysets/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId

        if ($KQLQuerysetFormat) {
            $apiEndpointUrl = "{0}?format={1}" -f $apiEndpointUrl, $KQLQuerysetFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Post `
            -ErrorAction Stop `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 5: Validate the response code and handle the response
        switch ($statusCode) {
            200 {
                Write-Message -Message "KQLQueryset '$KQLQuerysetId' definition retrieved successfully!" -Level Debug
                return $response.definition.parts
            }
            202 {

                Write-Message -Message "Getting KQLQueryset '$KQLQuerysetId' definition request accepted. Retrieving in progress!" -Level Debug

                [string]$operationId = $responseHeader["x-ms-operation-id"]
                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Getting Long Running Operation status" -Level Debug
               
                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId
                Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug
                # Handle operation result
                if ($operationStatus.status -eq "Succeeded") {
                    Write-Message -Message "Operation Succeeded" -Level Debug
                    Write-Message -Message "Getting Long Running Operation result" -Level Debug
                
                    $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                    Write-Message -Message "Long Running Operation status: $operationResult" -Level Debug
                
                    return $operationResult.definition.parts
                }
                else {
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Debug
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Error
                    return $operationStatus
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
        # Step 9: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve KQLQueryset. Error: $errorDetails" -Level Error
    } 
 
}
