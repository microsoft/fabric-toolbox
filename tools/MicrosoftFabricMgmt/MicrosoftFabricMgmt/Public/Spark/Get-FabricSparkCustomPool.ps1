<#
.SYNOPSIS
    Retrieves Spark custom pools from a specified workspace.

.DESCRIPTION
    This function retrieves all Spark custom pools from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.
    The function supports filtering by SparkCustomPoolId or SparkCustomPoolName, but not both simultaneously.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve Spark custom pools. This parameter is mandatory.

.PARAMETER SparkCustomPoolId
    The ID of the specific Spark custom pool to retrieve. This parameter is optional.

.PARAMETER SparkCustomPoolName
    The name of the specific Spark custom pool to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345"
    This example retrieves all Spark custom pools from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolId "pool1"
    This example retrieves the Spark custom pool with ID "pool1" from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolName "MyPool"
    This example retrieves the Spark custom pool with name "MyPool" from the workspace with ID "12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Handles continuation tokens to retrieve all Spark custom pools if there are multiple pages of results.

    Author: Tiago Balabuch
#>
function Get-FabricSparkCustomPool {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkCustomPoolId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkCustomPoolName
    )

    try {
        # Step 1: Handle ambiguous input
        if ($SparkCustomPoolId -and $SparkCustomPoolName) {
            Write-Message -Message "Both 'SparkCustomPoolId' and 'SparkCustomPoolName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        # Step 3: Initialize variables
        $continuationToken = $null
        $SparkCustomPools = @()
        
        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/spark/pools" -f $FabricConfig.BaseUrl, $WorkspaceId
        

        do {
            # Step 5: Construct the API URL
            $apiEndpointUrl = $baseApiEndpointUrl
        
            if ($null -ne $continuationToken) {
                # URL-encode the continuation token
                $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)
                $apiEndpointUrl = "{0}?continuationToken={1}" -f $apiEndpointUrl, $encodedToken
            }
            Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug
         
            # Step 6: Make the API request
            $response = Invoke-RestMethod `
                -Headers $FabricConfig.FabricHeaders `
                -Uri $apiEndpointUrl `
                -Method Get `
                -ErrorAction Stop `
                -SkipHttpErrorCheck `
                -ResponseHeadersVariable "responseHeader" `
                -StatusCodeVariable "statusCode"
         
            # Step 7: Validate the response code
            if ($statusCode -ne 200) {
                Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-Message -Message "Error: $($response.message)" -Level Error
                Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-Message "Error Code: $($response.errorCode)" -Level Error
                return $null
            }
         
            # Step 8: Add data to the list
            if ($null -ne $response) {
                Write-Message -Message "Adding data to the list" -Level Debug
                $SparkCustomPools += $response.value
                 
                # Update the continuation token if present
                if ($response.PSObject.Properties.Match("continuationToken")) {
                    Write-Message -Message "Updating the continuation token" -Level Debug
                    $continuationToken = $response.continuationToken
                    Write-Message -Message "Continuation token: $continuationToken" -Level Debug
                }
                else {
                    Write-Message -Message "Updating the continuation token to null" -Level Debug
                    $continuationToken = $null
                }
            }
            else {
                Write-Message -Message "No data received from the API." -Level Warning
                break
            }
        } while ($null -ne $continuationToken)
        Write-Message -Message "Loop finished and all data added to the list" -Level Debug
       
        # Step 8: Filter results based on provided parameters
        $SparkCustomPool = if ($SparkCustomPoolId) {
            $SparkCustomPools | Where-Object { $_.id -eq $SparkCustomPoolId }
        }
        elseif ($SparkCustomPoolName) {
            $SparkCustomPools | Where-Object { $_.name -eq $SparkCustomPoolName }
        }
        else {
            # Return all SparkCustomPools if no filter is provided
            Write-Message -Message "No filter provided. Returning all SparkCustomPools." -Level Debug
            $SparkCustomPools
        }

        # Step 9: Handle results
        if ($SparkCustomPool) {
            Write-Message -Message "SparkCustomPool found matching the specified criteria." -Level Debug
            return $SparkCustomPool
        }
        else {
            Write-Message -Message "No SparkCustomPool found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve SparkCustomPool. Error: $errorDetails" -Level Error
    } 
 
}
