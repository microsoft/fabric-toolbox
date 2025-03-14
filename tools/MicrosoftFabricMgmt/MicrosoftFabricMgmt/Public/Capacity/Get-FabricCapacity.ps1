
<#
.SYNOPSIS
    Retrieves capacity details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves capacity details from a specified workspace using either the provided capacityId or capacityName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER capacityId
    The unique identifier of the capacity to retrieve. This parameter is optional.

.PARAMETER capacityName
    The name of the capacity to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricCapacity -capacityId "capacity-12345"
    This example retrieves the capacity details for the capacity with ID "capacity-12345".

.EXAMPLE
     Get-FabricCapacity -capacityName "MyCapacity"
    This example retrieves the capacity details for the capacity named "MyCapacity".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricCapacity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$capacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$capacityName
    )
    try {
        # Step 1: Handle ambiguous input
        if ($capacityId -and $capacityName) {
            Write-Message -Message "Both 'capacityId' and 'capacityName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
 
        # Step 3: Initialize variables
        $continuationToken = $null
        $capacities = @()
         
        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/capacities" -f $FabricConfig.BaseUrl
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
                $capacities += $response.value
         
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
 
        # Step 9: Filter results based on provided parameters
        $capacity = if ($capacityId) {
            $capacities | Where-Object { $_.Id -eq $capacityId }
        }
        elseif ($capacityName) {
            $capacities | Where-Object { $_.DisplayName -eq $capacityName }
        }
        else {
            # No filter, return all capacities
            Write-Message -Message "No filter specified. Returning all capacities." -Level Debug
            return $capacities
        }
 
        # Step 10: Handle results
        if ($capacity) {
            Write-Message -Message "Capacity found matching the specified criteria." -Level Debug
            return $capacity
        }
        else {
            Write-Message -Message "No capacity found matching the specified criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve capacity. Error: $errorDetails" -Level Error
        return $null
    }
} 