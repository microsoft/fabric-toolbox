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
        # Step 1: Handle ambiguous input
        if ($DomainId -and $DomainName) {
            Write-Message -Message "Both 'DomainId' and 'DomainName' were provided. Please specify only one." -Level Error
            return @()
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 3: Construct the API URL with filtering logic        
        $apiEndpointUrl = "{0}/admin/domains" -f $FabricConfig.BaseUrl
        if ($NonEmptyDomainsOnly) {
            $apiEndpointUrl = "{0}?nonEmptyOnly=true" -f $apiEndpointUrl
        }
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Get `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 5: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }
                    
        # Step 6: Handle empty response
        if (-not $response) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }


        # Step 7: Filter results based on provided parameters
        $domains = if ($DomainId) {
            $response.domains | Where-Object { $_.Id -eq $DomainId }
        }
        elseif ($DomainName) {
            $response.domains | Where-Object { $_.DisplayName -eq $DomainName }
        }
        else {
            # Return all domains if no filter is provided
            Write-Message -Message "No filter provided. Returning all domains." -Level Debug
            return $response.domains
        }

        # Step 8: Handle results
        if ($domains) {
            return $domains
        }
        else {
            Write-Message -Message "No domain found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 9: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve environment. Error: $errorDetails" -Level Error
    }
}
