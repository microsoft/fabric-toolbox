<#
.SYNOPSIS
Removes all organization sharing links for every Fabric item in the tenant.

.DESCRIPTION
Removes all sharing links of a specified type (e.g., 'OrgLink') from every Fabric item in the tenant by sending a POST request to the admin removeAllSharingLinks API. This action affects all items tenant-wide and cannot be undone. Requires Fabric administrator permissions.

.PARAMETER sharingLinkType
Specifies the type of sharing link to remove. Default is 'OrgLink'. Only supported value is 'OrgLink'.

.EXAMPLE
    Remove-FabricSharingLinks -sharingLinkType 'OrgLink'

.NOTES
- API Endpoint: POST /admin/items/removeAllSharingLinks
- Requires Fabric administrator permissions and a valid authentication context.
- Destructive and tenant-wide: supports -WhatIf/-Confirm (ConfirmImpact High).

Author: Tiago Balabuch
#>
function Remove-FabricSharingLinks {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('OrgLink')]
        $sharingLinkType = 'OrgLink'
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/items/removeAllSharingLinks" -f $script:FabricAuthContext.BaseUrl
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body
            $body = @{
                sharingLinkType = $sharingLinkType
            }

            # Convert the body to JSON
            $bodyJson = $body | ConvertTo-Json -Depth 2
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Make the API request
            if ($PSCmdlet.ShouldProcess("all items with sharing link type '$sharingLinkType'", "Remove all sharing links")) {
                $response = Invoke-FabricAPIRequest `
                    -BaseURI $apiEndpointURI `
                    -Headers $script:FabricAuthContext.FabricHeaders `
                    -Method Post `
                    -Body $bodyJson

                # Return the API response
                Write-FabricLog -Message "All sharing links have been removed successfully from the specified items." -Level Host
                return $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove all sharing links. Error details: $errorDetails" -Level Error
        }
    }
}
