<#
.SYNOPSIS
    Invokes a Microsoft Fabric API request with support for pagination and long-running operations.

.DESCRIPTION
    This function handles HTTP requests to Microsoft Fabric APIs, including pagination via continuation tokens and long-running operations (LROs). It supports various HTTP methods and processes responses based on status codes.

.PARAMETER Headers
    Hashtable containing HTTP headers required for the API request.

.PARAMETER BaseURI
    The base URI endpoint for the API request.

.PARAMETER Method
    HTTP method to use for the request. Allowed values: Get, Post, Delete, Put, Patch.

.PARAMETER Body
    Optional request body for methods that support payloads (Post, Put, Patch).

.PARAMETER ContentType
    Content type of the request body. Defaults to "application/json; charset=utf-8".

.PARAMETER WaitForCompletion
    Indicates whether to wait for completion of long-running operations. Defaults to $true.

.PARAMETER HasResults
    Indicates whether the operation is expected to return results. Defaults to $true.

.EXAMPLE
    Invoke-FabricAPIRequest -Headers $headers -BaseURI "https://api.fabric.microsoft.com/resource" -Method "Get"

.NOTES
    Author: Tiago Balabuch
#>
function Invoke-FabricAPIRequest {
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Headers,
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$BaseURI,

        [Parameter(Mandatory = $true)] 
        [ValidateSet('Get', 'Post', 'Delete', 'Put', 'Patch')] 
        [string] $Method,
        
        [Parameter(Mandatory = $false)] 
        [string] $Body,

        [Parameter(Mandatory = $false)] 
        [string] $ContentType = "application/json; charset=utf-8",

        [Parameter(Mandatory = $false)]
        [bool]$WaitForCompletion = $true,

        [Parameter(Mandatory = $false)]
        [bool]$HasResults = $true
    )

    try {
        # Initialize continuation token and results collection
        $continuationToken = $null
        $results = New-Object System.Collections.Generic.List[Object]

        # Ensure System.Web assembly is loaded for URL encoding
        if (-not ([System.Web.HttpUtility] -as [type])) {
            Add-Type -AssemblyName System.Web
        }

        # Loop to handle pagination via continuation tokens
        do {
            # Construct API endpoint URI with continuation token if present
            $apiEndpointURI = $BaseURI
            if ($null -ne $continuationToken) {
                $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)
                $separator = $BaseURI -like "*`?*" ? "&" : "?"
                $apiEndpointURI = "$BaseURI$separator" + "continuationToken=$encodedToken"
            }

            Write-Message -Message "Calling API: $apiEndpointURI" -Level Debug

            # Prepare parameters for Invoke-RestMethod
            $invokeParams = @{
                Headers                 = $Headers
                Uri                     = $apiEndpointURI
                Method                  = $Method
                ErrorAction             = 'Stop'
                SkipHttpErrorCheck      = $true
                ResponseHeadersVariable = 'responseHeader'
                StatusCodeVariable      = 'statusCode'
            }

            # Include body and content type for applicable HTTP methods
            if ($Method -in @('Post', 'Put', 'Patch') -and $Body) {
                $invokeParams.Body = $Body
                $invokeParams.ContentType = $ContentType
            }

            # Invoke the API request
            $response = Invoke-RestMethod @invokeParams
            Write-Message -Message "API response code: $statusCode" -Level Debug

            # Handle response based on HTTP status code
            switch ($statusCode) {
                200 {
                    Write-Message -Message "API call succeeded." -Level Debug 
                    if ($response) {
                        # Determine response structure and add data to results
                        $propertyNames = $response.PSObject.Properties.Name
                        switch ($true) {
                            { $propertyNames -contains 'value' } { $results.AddRange($response.value); break }
                            { $propertyNames -contains 'accessEntities' } { $results.AddRange($response.accessEntities); break }
                            { $propertyNames -contains 'domains' } { $results.AddRange($response.domains); break }
                            { $propertyNames -contains 'publishDetails' } { $results.AddRange($response.publishDetails); break }
                            { $propertyNames -contains 'definition' } { $results.AddRange($response.definition.parts); break }
                            { $propertyNames -contains 'data' } { $results.AddRange($response.data); break }
                            default { $results.Add($response) }
                        }
                        # Update continuation token for pagination
                        $continuationToken = $propertyNames -contains 'continuationToken' ? $response.continuationToken : $null
                    }
                    else {
                        Write-Message -Message "No data in response" -Level Debug
                        $continuationToken = $null
                    }
                }
                201 {
                    Write-Message -Message "Resource created successfully." -Level Debug 
                    return $response
                }
                202 {
                    # Handle long-running operations (LROs)
                    Write-Message -Message "Request accepted. The operation is being processed." -Level Info
                    [string]$operationId = $responseHeader["x-ms-operation-id"]
                    [string]$location = $responseHeader["Location"]
                    $retryAfter = $responseHeader["Retry-After"]

                    # If the response contains an operation ID or Location header, handle as a long-running operation (LRO)
                    if ($operationId -or $location) {
                        Write-Message -Message "Operation ID: '$operationId', Location: '$location'" -Level Debug

                        # If waiting for completion is requested, poll the operation status until completion
                        if ($waitForCompletion) {
                            Write-Message -Message "The operation is running synchronously. Proceeding with long-running operation." -Level Debug
                            $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location
                            Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug

                            # If the operation succeeded and results are expected, fetch the result
                            if ($operationStatus.status -eq "Succeeded" -and $HasResults) {
                                Write-Message -Message "Operation succeeded. Fetching result." -Level Debug
                                $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                                # Add result data to the results collection, handling 'definition' property if present
                                if ($operationResult.PSObject.Properties.Name -contains 'definition') {
                                    $results.AddRange($operationResult.definition.parts)
                                }
                                else {
                                    $results.Add($operationResult)
                                }
                                return , $results.ToArray()
                            }

                            # Throw an error if the operation failed
                            if ($operationStatus.status -eq "Failed") {
                                throw "Fabric long-running operation failed. Status: Failed. Details: $($operationStatus | ConvertTo-Json -Depth 10)"
                            }
                        }
                        else {
                            # If not waiting for completion, return operation tracking information
                            Write-Message -Message "The operation is running asynchronously." -Level Info
                            return [PSCustomObject]@{
                                OperationId = $operationId
                                Location    = $location
                                RetryAfter  = $retryAfter
                            }
                        }
                    }
                }
                # Handle common HTTP error codes
                400 { $errorMsg = "Bad Request" }
                401 { $errorMsg = "Unauthorized" }
                403 { $errorMsg = "Forbidden" }
                404 { $errorMsg = "Not Found" }
                409 { $errorMsg = "Conflict" }
                429 { $errorMsg = "Too Many Requests" }
                500 { $errorMsg = "Internal Server Error" }
                default { $errorMsg = "Unexpected response code: $statusCode" }
            }

            # Throw error for unsuccessful responses
            if ($statusCode -notin 200, 201, 202) {
                throw "API request failed with status code $statusCode. Error: $errorMsg"
            }

        } while ($null -ne $continuationToken)

        return , $results.ToArray()
    }
    catch {
        Write-Message -Message "Invoke Fabric API error. Error: $($_.Exception.Message)" -Level Error
        throw 
    }
}