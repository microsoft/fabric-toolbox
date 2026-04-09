<#
.SYNOPSIS
    Rotates a tenant encryption key using the Power BI admin API.

.DESCRIPTION
    The Start-FabricAdminEncryptionKeyRotation cmdlet initiates rotation of a tenant encryption key using the admin API.

.PARAMETER KeyId
    Required. The encryption key ID to rotate.

.EXAMPLE
    Start-FabricAdminEncryptionKeyRotation -KeyId "key123"

    Initiates rotation of the specified encryption key.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/tenantKeys/{tenantKeyId}/rotate
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Start-FabricAdminEncryptionKeyRotation {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$KeyId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/tenantKeys/$KeyId/rotate"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Encryption key '$KeyId'", "Rotate")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = '{}'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Encryption key '$KeyId' rotation initiated successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to rotate encryption key. Error: $errorDetails" -Level Error
        }
    }
}
