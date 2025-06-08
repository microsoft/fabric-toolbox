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
        $continuationToken = $null
        $results = New-Object System.Collections.Generic.List[Object]

        if (-not ([System.Web.HttpUtility] -as [type])) {
            Add-Type -AssemblyName System.Web
        }
    
        do {
            $apiEndpointURI = $BaseURI
            if ($null -ne $continuationToken) {
                $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)
                $separator = $BaseURI -like "*`?*" ? "&" : "?"
                $apiEndpointURI = "$BaseURI$separator" + "continuationToken=$encodedToken"
            }

            Write-Message -Message "Calling API: $apiEndpointURI" -Level Debug

            $invokeParams = @{
                Headers                 = $Headers
                Uri                     = $apiEndpointURI
                Method                  = $Method
                ErrorAction             = 'Stop'
                SkipHttpErrorCheck      = $true
                ResponseHeadersVariable = 'responseHeader'
                StatusCodeVariable      = 'statusCode'
            }

            if ($Method -in @('Post', 'Put', 'Patch') -and $Body) {
                $invokeParams.Body = $Body
                $invokeParams.ContentType = $ContentType
            }

            $response = Invoke-RestMethod @invokeParams
            Write-Message -Message "API response code: $statusCode" -Level Debug

            switch ($statusCode) {
                200 {
                    Write-Message -Message "API call succeeded." -Level Debug 
                    if ($response) {
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
                        # Write-Message -Message "############# New Code 200 #################" -Level Debug
                        
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
                    Write-Message -Message "Request accepted. The operation is being processed." -Level Info
                    [string]$operationId = $responseHeader["x-ms-operation-id"]
                    [string]$location = $responseHeader["Location"]
                    $retryAfter = $responseHeader["Retry-After"]

                    if ($operationId -or $location) {
                        Write-Message -Message "Operation ID: '$operationId', Location: '$location'" -Level Debug

                        if ($waitForCompletion) {
                            Write-Message -Message "The operation is running synchronously. Proceeding with long-running operation." -Level Debug
                            Write-Message -Message "Getting Long Running Operation status" -Level Debug
                        
                            $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location
                            Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug

                            if ($operationStatus.status -eq "Succeeded" -and $HasResults) {
                                Write-Message -Message "Operation succeeded. Fetching result." -Level Debug
                                $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                                Write-Message -Message "Long Running Operation result: $operationResult" -Level Debug                   

                                if ($operationResult.PSObject.Properties.Name -contains 'definition') {
                                    $results.AddRange($operationResult.definition.parts)
                                }
                                else {
                                    $results.Add($operationResult)
                                }
                                return , $results.ToArray()
                            }


                            if ($operationStatus.status -eq "Failed") {
                                $results.Add($operationStatus)
                                $resultArray = $results.ToArray()
                                return $resultArray
                                throw "Fabric long-running operation failed. Status: Failed. Details: $($operationStatus | ConvertTo-Json -Depth 10)"
                            }

                            <# 
                            if ($operationStatus.status -eq "Failed") {
                                $results.Add($operationStatus)
                                $resultArray = $results.ToArray()

                                $exception = [System.Exception]::new("Operation failed with status: $($operationStatus.status).")
                                $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                                    $exception,
                                    "FabricOperationFailed",
                                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                                    $resultArray
                                )

                                $PSCmdlet.WriteError($errorRecord)  # Emit error but continue
                                return , $resultArray
                            }


                            if ($operationStatus.status -eq "Failed") {
                                Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Error
                                #return $operationStatus
                                $results.Add($operationStatus)
                                return , $results.ToArray()
                                Write-Message -Message "AFTER RETURN" -Level Error
                                throw "Operation failed with status: $($operationStatus.status)."
                            }


                            if ($operationStatus.status -eq "Failed") {
                                Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Error
                                $results.Add($operationStatus)
                                Write-Message -Message "object: $($results.error)" -Level Debug
                                $resultArray = $results.ToArray()
                                
                                $exception = [System.Exception]::new("Operation failed with status: $($operationStatus.status).")
                                $errorRecord = [System.Management.Automation.ErrorRecord]::new(
                                    $exception,
                                    "FabricOperationFailed",
                                    [System.Management.Automation.ErrorCategory]::OperationStopped,
                                    $resultArray
                                )
                                throw $errorRecord
                            }
#>

                        }
                        else {
                            Write-Message -Message "The operation is running asynchronously." -Level Info
                            return [PSCustomObject]@{
                                OperationId = $operationId
                                Location    = $location
                                RetryAfter  = $retryAfter
                            }
                        }
                    }
                    else {
                        Write-Message -Message "Operation ID or Location not found. Skipping long-running operation handling." -Level Debug
                    }
                }
                400 { $errorMsg = "Bad Request" }
                401 { $errorMsg = "Unauthorized" }
                403 { $errorMsg = "Forbidden" }
                404 { $errorMsg = "Not Found" }
                409 { $errorMsg = "Conflict" }
                429 { $errorMsg = "Too Many Requests" }
                500 { $errorMsg = "Internal Server Error" }
                default { $errorMsg = "Unexpected response code: $statusCode" }
            }

            if ($statusCode -notin 200, 201, 202) {
                Write-Message -Message "$errorMsg : $($response.message -join ', ')" -Level Error
                Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-Message -Message "Error Code: $($response.errorCode)" -Level Error
                throw "API request failed with status code $statusCode."
            }

        } while ($null -ne $continuationToken)

        return , $results.ToArray()
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Invoke Fabric API error. Error: $errorDetails" -Level Error
        throw 
    }
}

<#

function Invoke-FabricAPIRequest_old {
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
        [ValidateNotNullOrEmpty()]
        [bool]$waitForCompletion = $true,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$hasResults = $true
    )

    $continuationToken = $null
    $results = @()

    if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
        Add-Type -AssemblyName System.Web
    }

    do {
        $apiEndpointURI = $BaseURI
        if ($null -ne $continuationToken) {
            $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)

            if ($BaseURI -like "*`?*") {
                # URI already has parameters, append with &
                $apiEndpointURI = "$BaseURI&continuationToken=$encodedToken"
            }
            else {
                # No existing parameters, append with ?
                $apiEndpointURI = "$BaseURI?continuationToken=$encodedToken"
            }
        }
        Write-Message -Message "Calling API: $apiEndpointURI" -Level Debug

        $invokeParams = @{
            Headers                 = $Headers
            Uri                     = $apiEndpointURI
            Method                  = $Method
            ErrorAction             = 'Stop'
            SkipHttpErrorCheck      = $true
            ResponseHeadersVariable = 'responseHeader'
            StatusCodeVariable      = 'statusCode'
            # TimeoutSec              = $timeoutSec
        }

        if ($method -in @('Post', 'Put', 'Patch') -and $body) {
            $invokeParams.Body = $body
            $invokeParams.ContentType = $contentType
        }

        $response = Invoke-RestMethod @invokeParams
        Write-Message -Message "API response code: $statusCode" -Level Debug
        switch ($statusCode) {

            200 {
                Write-Message -Message "API call succeeded." -Level Debug 
                # Step 5: Handle and log the response
                if ($response) {
                    if ($response.PSObject.Properties.Name -contains 'value') {
                        $results += $response.value
                    }
                    elseif ($response.PSObject.Properties.Name -contains 'accessEntities') {
                        $results += $response.accessEntities
                    } 
                    elseif ($response.PSObject.Properties.Name -contains 'domains') {
                        $results += $response.domains
                    }
                    elseif ($response.PSObject.Properties.Name -contains 'publishDetails') {
                        $results += $response.publishDetails
                    } 
                    elseif ($response.PSObject.Properties.Name -contains 'definition') {
                        $results += $response.definition.parts
                    } 
                    else {
                        $results += $response
                    }
                    $continuationToken = $response.PSObject.Properties.Match("continuationToken") ? $response.continuationToken : $null
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
                # Step 6: Handle long-running operations      
                Write-Message -Message "Request accepted. Provisioning in progress." -Level Info
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                # Need to implement a retry mechanism for long running operations  
                # [string]$retryAfter = $responseHeader["Retry-After"] 

                if ($operationId -and $location) {
                    Write-Message -Message "Operation ID and Location found. Proceeding with long-running operation." -Level Debug
                    Write-Message -Message "Operation ID: '$operationId', Location: '$location'" -Level Debug
                    Write-Message -Message "Getting Long Running Operation status" -Level Debug
                   
                    if ($waitForCompletion -eq $true) {
                        $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location
                        Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug

                        return $operationStatus
                    }
                    else {
                        Write-Message -Message "The operation is running asynchronously." -Level Info
                        Write-Message -Message "Use the returned details to check the operation status." -Level Debug
                        Write-Message -Message "To wait for the operation to complete, set the 'waitForCompletion' parameter to true." -Level Debug  
                        $operationDetails = [PSCustomObject]@{
                            OperationId = $operationId
                            Location    = $location
                            RetryAfter  = $retryAfter
                        }
                        return $operationDetails
                    }
                    # Handle operation result
                    if ($operationStatus.status -eq "Succeeded" -and $hasResults -eq $true) {
                        Write-Message -Message "Operation succeeded. Fetching result." -Level Debug
                        
                        $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                        Write-Message -Message "Long Running Operation result: $operationResult" -Level Debug                   

                        if ($operationResult.PSObject.Properties.Name -contains 'definition') {
                            $results += $operationResult.definition.parts
                        }
                        else {
                            $results += $operationResult
                        }
                        return $results
                    }
                    else {
                        Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Error
                        return $operationStatus
                    }
                }
                else {
                    Write-Message -Message "Operation ID or Location not found. Skipping long-running operation handling." -Level Debug
                }
               
            }
            400 { $errorMsg = "Bad Request" }
            401 { $errorMsg = "Unauthorized" }
            403 { $errorMsg = "Forbidden" }
            404 { $errorMsg = "Not Found" }
            409 { $errorMsg = "Conflict" }
            429 { $errorMsg = "Too Many Requests" }
            500 { $errorMsg = "Internal Server Error" }
            default { $errorMsg = "Unexpected response code: $statusCode" }
        }
    
        if ($statusCode -notin 200, 201, 202) {
            Write-Message -Message "$errorMsg : $($response.message)" -Level Error
            Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
            Write-Message -Message "Error Code: $($response.errorCode)" -Level Error
            throw "API request failed with status code $statusCode."
        }
    } while ($null -ne $continuationToken)

    return $results
}
#>



