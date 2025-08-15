<#
.SYNOPSIS
Retrieves tenant setting overrides for a specific domain or all capacities in the Fabric tenant.

.DESCRIPTION
The `Get-FabricDomainTenantSettingOverrides` function retrieves tenant setting overrides for all domains in the Fabric tenant by making a GET request to the designated API endpoint. The function ensures token validity before making the request and handles the response appropriately.

.EXAMPLE
Get-FabricDomainTenantSettingOverrides

Fetches tenant setting overrides for all domains in the Fabric tenant.

.NOTES
- Requires the `$FabricConfig` global configuration, which must include `BaseUrl` and `FabricHeaders`.
- Ensures token validity by invoking `Test-TokenExpired` before making the API request.
- Logs detailed messages for debugging and error handling.

Author: Tiago Balabuch
#>
function Get-FabricDomainTenantSettingOverrides {
    [CmdletBinding()]
    param ( )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams 

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-Message -Message "Successfully retrieved domain tenant setting overrides." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Error retrieving domain tenant setting overrides: $errorDetails" -Level Error
    }
}