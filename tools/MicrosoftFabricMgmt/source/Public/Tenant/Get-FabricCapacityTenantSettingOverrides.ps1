<#
.SYNOPSIS
Retrieves tenant setting overrides for a specific capacity or all capacities in the Fabric tenant.

.DESCRIPTION
The `Get-FabricCapacityTenantSettingOverrides` function retrieves tenant setting overrides for a specific capacity or all capacities in the Fabric tenant by making a GET request to the appropriate API endpoint. If a `capacityId` is provided, the function retrieves overrides for that specific capacity. Otherwise, it retrieves overrides for all capacities.

.PARAMETER capacityId
The ID of the capacity for which tenant setting overrides should be retrieved. If not provided, overrides for all capacities will be retrieved.

.EXAMPLE
Get-FabricCapacityTenantSettingOverrides

Returns all capacities tenant setting overrides.

.EXAMPLE
Get-FabricCapacityTenantSettingOverrides -capacityId "12345"

Returns tenant setting overrides for the capacity with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricCapacityTenantSettingOverrides {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$capacityId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI with filtering logic  
        if ($capacityId) {
            $apiEndpointURI = "{0}/admin/capacities/{1}/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl, $capacityId
            $message = "Successfully retrieved tenant setting overrides for capacity ID: $capacityId."
        }
        else {
            $apiEndpointURI = "{0}/admin/capacities/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl
            $message = "Successfully retrieved capacity tenant setting overrides."
        }
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
            # Return all tenant setting overrides
            Write-Message -Message $message -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Error retrieving capacity tenant setting overrides: $errorDetails" -Level Error
    }
}