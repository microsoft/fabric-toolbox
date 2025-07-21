<#
.SYNOPSIS
Retrieves tenant setting overrides for all workspaces in the Fabric tenant.

.DESCRIPTION
The `Get-FabricWorkspaceTenantSettingOverrides` function retrieves tenant setting overrides for all workspaces in the Fabric tenant by making a GET request to the appropriate API endpoint. The function validates the authentication token before making the request and handles the response accordingly.

.EXAMPLE
Get-FabricWorkspaceTenantSettingOverrides

Returns all workspaces tenant setting overrides.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricWorkspaceTenantSettingOverrides {
    [CmdletBinding()]
    param ( )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/admin/workspaces/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl
        Write-Message -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

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
            # Return all workspace tenant setting overrides
            Write-Message -Message "Successfully retrieved workspaces tenant setting overrides." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Error retrieving workspaces tenant setting overrides: $errorDetails" -Level Error
    }
}