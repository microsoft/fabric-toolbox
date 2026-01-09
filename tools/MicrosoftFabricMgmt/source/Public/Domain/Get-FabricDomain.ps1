<#
.SYNOPSIS
Retrieves domain information from Microsoft Fabric, optionally filtering by domain ID, domain name, or only non-empty domains.

.DESCRIPTION
The `Get-FabricDomain` function allows retrieval of domains in Microsoft Fabric, with optional filtering by domain ID or name. Additionally, it can filter to return only non-empty domains.

.PARAMETER DomainId
(Optional) The ID of the domain to retrieve.

.PARAMETER DomainName
(Optional) The display name of the domain to retrieve.

.PARAMETER NonEmptyDomainsOnly
(Optional) If set to `$true`, only domains containing workspaces will be returned.

.EXAMPLE
Get-FabricDomain -DomainId "12345"

Fetches the domain with ID "12345".

.EXAMPLE
Get-FabricDomain -DomainName "Finance"

Fetches the domain with the display name "Finance".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricDomain {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$NonEmptyDomainsOnly = $false
    )
    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI with filtering logic
        $queryParams = @{}
        if ($NonEmptyDomainsOnly) {
            $queryParams['nonEmptyOnly'] = 'true'
        }
        $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains') -QueryParameters $queryParams
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering
        Select-FabricResource -InputObject $dataItems -Id $DomainId -Name $DomainName -ResourceType 'Domain'
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment. Error: $errorDetails" -Level Error
    }
}
