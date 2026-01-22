<#
.SYNOPSIS
    Retrieves External Data Shares details from a specified Microsoft Fabric.

.DESCRIPTION
    This function retrieves External Data Shares details.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER ExternalDataShareId
    (Optional) The ID of the External Data Share to retrieve. If not provided, all External Data Shares will be returned.

.EXAMPLE
    Get-FabricExternalDataShares -ExternalDataShareId "12345"
    This example retrieves the External Data Share with ID "12345".
.EXAMPLE
    Get-FabricExternalDataShares
    This example retrieves the External Data Shares details.
.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricExternalDataShare {
    [CmdletBinding()]
    [Alias("Get-FabricExternalDataShares")]
    param (
        [Parameter(Mandatory = $False)]
        [ValidateNotNullOrEmpty()]
        [string]$ExternalDataShareId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'admin/items/externalDataShares'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering logic
        Select-FabricResource -InputObject $dataItems -Id $ExternalDataShareId -ResourceType 'ExternalDataShare' -TypeName 'MicrosoftFabric.ExternalDataShare'
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve External Data Shares. Error: $errorDetails" -Level Error
    }
}
