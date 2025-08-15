<#
.SYNOPSIS
Retrieves capacities tenant settings overrides from the Fabric tenant.

.DESCRIPTION
The `Get-FabricTenantSetting` function retrieves capacities tenant settings overrides for a Fabric tenant by making a GET request to the appropriate API endpoint. 

.EXAMPLE
Get-FabricTenantSettingOverridesCapacity

Returns all capacities tenant settings overrides.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Is-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Get-FabricTenantSettingOverridesCapacity {
    [CmdletBinding()]
    param ()
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 3: Initialize variables
        $continuationToken = $null
        $capacitiesOverrides = @()

        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/admin/capacities/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl
        
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
            $restParams = @{
                Headers = $FabricConfig.FabricHeaders
                Uri = $apiEndpointUrl
                Method = 'Get'
                ErrorAction = 'Stop'
                SkipHttpErrorCheck = $true
                ResponseHeadersVariable = 'responseHeader'
                StatusCodeVariable = 'statusCode'
            }
            $response = Invoke-RestMethod @restParams
         
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
                $capacitiesOverrides += $response.value
                 
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
        # Step 7: Handle results
        if ($capacitiesOverrides) {
            Write-Message -Message "Capacities overrides found." -Level Debug
            return $capacitiesOverrides
        }
        else {
            Write-Message -Message "No capacity capacities tenant settings overrides overrides found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 8: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve capacities tenant settings overrides. Error: $errorDetails" -Level Error
    }
}
