<#
.SYNOPSIS
Removes a tenant setting override from a specific capacity in the Fabric tenant.

.DESCRIPTION
The `Revoke-FabricCapacityTenantSettingOverrides` function deletes a specific tenant setting override for a given capacity in the Fabric tenant by making a DELETE request to the appropriate API endpoint.

.PARAMETER capacityId
The unique identifier of the capacity from which the tenant setting override will be removed.

.PARAMETER tenantSettingName
The name of the tenant setting override to be removed.

.EXAMPLE
Revoke-FabricCapacityTenantSettingOverrides -capacityId "12345" -tenantSettingName "ExampleSetting"

Removes the tenant setting override named "ExampleSetting" from the capacity with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Revoke-FabricCapacityTenantSettingOverrides {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$capacityId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$tenantSettingName
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/admin/capacities/{1}/delegatedTenantSettingOverrides/{2}" -f $FabricConfig.BaseUrl, $capacityId, $tenantSettingName
        Write-Message -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Successfully removed the tenant setting override '$tenantSettingName' from the capacity with ID '$capacityId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Error retrieving capacity tenant setting overrides: $errorDetails" -Level Error
    }
}