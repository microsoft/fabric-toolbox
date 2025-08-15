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
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}" -f $FabricConfig.BaseUrl, $DomainId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Domain '$DomainId' deleted successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
