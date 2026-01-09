<#
.SYNOPSIS
Removes all sharing links in bulk from s        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Delete'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParamsied items in Microsoft Fabric.

.DESCRIPTION
Removes all sharing links of a specified type (e.g., 'OrgLink') from multiple items (such as datasets, reports, etc.) within a Microsoft Fabric workspace. Each item must include 'id' and 'type' properties. The function validates authentication and sends a bulk removal request to the Fabric API.

.PARAMETER sharingLinkType
Specifies the type of sharing link to remove. Default is 'OrgLink'. Only supported value is 'OrgLink'.

.EXAMPLE
    Remove-FabricSharingLinks -sharingLinkType 'OrgLink'

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Each item in `$Items` must have 'id' and 'type' properties.

Author: Tiago Balabuch
#>
function Remove-FabricSharingLinks {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('OrgLink')]
        $sharingLinkType = 'OrgLink'
    )
    try {
        # Validate Items structure
        foreach ($item in $Items) {
            if (-not ($item.id -and $item.type)) {
                throw "Each Item must contain 'id' and 'type' properties. Found: $item"
            }
        }

        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/items/removeAllSharingLinks" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
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
