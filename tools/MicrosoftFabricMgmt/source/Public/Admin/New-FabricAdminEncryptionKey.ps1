<#
.SYNOPSIS
    Creates a new tenant encryption key using the Power BI admin API.

.DESCRIPTION
    The New-FabricAdminEncryptionKey cmdlet creates a new tenant encryption key for Bring Your Own Key (BYOK) using the admin API.

.PARAMETER KeyName
    Required. The name for the new encryption key.

.EXAMPLE
    New-FabricAdminEncryptionKey -KeyName "Production Key"

    Creates a new encryption key with the specified name.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/tenantKeys
    - Requires Fabric Administrator permissions.
    - This operation requires Azure Key Vault integration.

    Author: Claude AI
#>
function New-FabricAdminEncryptionKey {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KeyName
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/tenantKeys"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                name = $KeyName
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Tenant", "Create new encryption key '$KeyName'")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Encryption key '$KeyName' created successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create encryption key. Error: $errorDetails" -Level Error
        }
    }
}
