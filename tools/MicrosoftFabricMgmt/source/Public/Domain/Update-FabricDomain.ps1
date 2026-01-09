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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains', $DomainId)
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DomainName
        }

        if ($DomainDescription) {
            $body.description = $DomainDescription
        }

        if ($DomainContributorsScope) {
            $body.contributorsScope = $DomainContributorsScope
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, "Update Fabric domain '$DomainName'")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Domain '$DomainName' updated successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
