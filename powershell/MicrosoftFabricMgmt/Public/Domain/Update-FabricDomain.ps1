<#
.SYNOPSIS
Updates a Fabric domain by its ID.

.DESCRIPTION
The `Update-FabricDomain` function modifies a specified domain in Microsoft Fabric using the provided parameters. 

.PARAMETER DomainId
The unique identifier of the domain to be updated.

.PARAMETER DomainName
The new name for the domain. Must be alphanumeric.

.PARAMETER DomainDescription
(Optional) A new description for the domain.

.PARAMETER DomainContributorsScope
(Optional) The contributors' scope for the domain. Accepted values: 'AdminsOnly', 'AllTenant', 'SpecificUsersAndGroups'.

.EXAMPLE
Update-FabricDomain -DomainId "12345" -DomainName "NewDomain" -DomainDescription "Updated description" -DomainContributorsScope "AdminsOnly"

Updates the domain with ID "12345" with a new name, description, and contributors' scope.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Update-FabricDomain {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DomainName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('AdminsOnly', 'AllTenant', 'SpecificUsersAndGroups')]
        [string]$DomainContributorsScope
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/admin/domains/{1}" -f $FabricConfig.BaseUrl, $DomainId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $DomainName
        }

        if ($DomainDescription) {
            $body.description = $DomainDescription
        }

        if ($DomainContributorsScope) {
            $body.contributorsScope = $DomainContributorsScope
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Patch `
            -Body $bodyJson `
            -ContentType "application/json" `
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
        
        # Step 6: Handle results
        Write-Message -Message "Domain '$DomainName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Step 7: Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
 