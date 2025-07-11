<#
.SYNOPSIS
Retrieves tenant settings from the Fabric environment.

.DESCRIPTION
The `Get-FabricTenantSetting` function retrieves tenant settings for a Fabric environment by making a GET request to the appropriate API endpoint. Optionally, it filters the results by the `SettingTitle` parameter.

.PARAMETER SettingTitle
(Optional) The title of a specific tenant setting to filter the results.

.EXAMPLE
Get-FabricTenantSetting

Returns all tenant settings.

.EXAMPLE
Get-FabricTenantSetting -SettingTitle "SomeSetting"

Returns the tenant setting with the title "SomeSetting".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Is-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Get-FabricTenantSetting {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SettingTitle
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/admin/tenantsettings" -f $FabricConfig.BaseUrl
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Get `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 4: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }
        
        # Step 5: Handle empty response
        if (-not $response) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
        # Step 6: Filter results based on provided parameters
        $settings = if ($SettingTitle) {
            $response.tenantSettings | Where-Object { $_.title -eq $SettingTitle }
        }
        else {
            # Return all workspaces if no filter is provided
            Write-Message -Message "No filter provided. Returning all tenant settings." -Level Debug
            $response.tenantSettings
        }

        # Step 7: Handle results
        if ($settings) {
            return $settings
        }
        else {
            Write-Message -Message "No tenant settings found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 8: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve tenant settings. Error: $errorDetails" -Level Error
    }
}
