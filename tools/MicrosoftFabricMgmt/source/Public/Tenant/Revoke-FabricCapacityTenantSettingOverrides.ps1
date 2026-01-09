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
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$capacityId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$tenantSettingName
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/capacities/{1}/delegatedTenantSettingOverrides/{2}" -f $script:FabricAuthContext.BaseUrl, $capacityId, $tenantSettingName
        Write-FabricLog -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("tenant setting override '$tenantSettingName' on capacity '$capacityId'", "Revoke")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully removed the tenant setting override '$tenantSettingName' from the capacity with ID '$capacityId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error retrieving capacity tenant setting overrides: $errorDetails" -Level Error
    }
}
