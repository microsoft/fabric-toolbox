<#
.SYNOPSIS
    Deletes a profile using the Power BI admin API.

.DESCRIPTION
    The Remove-FabricAdminProfile cmdlet deletes a service principal profile from the tenant using the admin API.

.PARAMETER ProfileId
    Required. The service principal profile object ID to delete.

.EXAMPLE
    Remove-FabricAdminProfile -ProfileId "profile123"

    Deletes the specified profile.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/profiles/{servicePrincipalProfileObjectId}
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Remove-FabricAdminProfile {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ProfileId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/profiles/$ProfileId"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Profile '$ProfileId'", "Delete")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Profile '$ProfileId' deleted successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete profile. Error: $errorDetails" -Level Error
        }
    }
}
