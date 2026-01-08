<#
.SYNOPSIS
Deletes a Fabric domain by its ID.

.DESCRIPTION
The `Remove-FabricDomain` function removes a specified domain from Microsoft Fabric by making a DELETE request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the domain to be deleted.

.EXAMPLE
Remove-FabricDomain -DomainId "12345"

Deletes the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Remove-FabricDomain {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains', $DomainId)
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, 'Delete Fabric domain')) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Domain '$DomainId' deleted successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
