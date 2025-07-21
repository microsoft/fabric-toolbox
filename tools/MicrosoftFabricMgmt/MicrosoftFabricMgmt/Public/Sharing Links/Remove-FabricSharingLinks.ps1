<#
.SYNOPSIS
Removes all sharing links in bulk from s        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
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
    [CmdletBinding()]
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
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/admin/items/removeAllSharingLinks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            sharingLinkType = $sharingLinkType
        }
       
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post `
            -Body $bodyJson
        
        # Return the API response
        Write-Message -Message "All sharing links have been removed successfully from the specified items." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to remove all sharing links. Error details: $errorDetails" -Level Error
    }
}
