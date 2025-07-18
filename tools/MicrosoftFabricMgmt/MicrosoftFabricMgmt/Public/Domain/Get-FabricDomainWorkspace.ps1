<#
.SYNOPSIS
Retrieves the workspaces associated with a specific domain in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricDomainWorkspace` function fetches the workspaces for the given domain ID.

.PARAMETER DomainId
The ID of the domain for which to retrieve workspaces.

.EXAMPLE
Get-FabricDomainWorkspace -DomainId "12345"

Fetches workspaces for the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Get-FabricDomainWorkspace {
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
        $apiEndpointURI = "{0}/admin/domains/{1}/workspaces" -f $FabricConfig.BaseUrl, $DomainId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
                  
        # Handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
        # Handle results
        if ($dataItems) {
            return $dataItems
        }
        else {
            Write-Message -Message "No workspace found for the '$DomainId'." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = Get-ErrorResponse($_.Exception)
        Write-Message -Message "Failed to retrieve domain workspaces. Error: $errorDetails" -Level Error
    }
}
