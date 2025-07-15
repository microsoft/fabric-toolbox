<#
.SYNOPSIS
Removes sharing links in bulk from items in Mic        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Delete'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParamst Fabric.

.DESCRIPTION
Removes sharing links of a specified type (e.g., 'OrgLink') from multiple items (such as datasets, reports, etc.) in a Microsoft Fabric workspace by sending a bulk removal request to the Fabric API. Each item must include 'id' and 'type' properties.

.PARAMETER Items
An array of objects, each containing 'id' and 'type' properties, representing the items from which sharing links will be removed.

.PARAMETER sharingLinkType
The type of sharing link to remove. Currently, only 'OrgLink' is supported. Default is 'OrgLink'.

.EXAMPLE
    Remove-FabricSharingLinksBulk -Items @(@{id="item1"; type="dataset"}, @{id="item2"; type="report"})

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Remove-FabricSharingLinksBulk {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Items, # Array with 'id' and 'type' 
    
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
        $apiEndpointURI = "{0}/admin/items/bulkRemoveSharingLinks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            items = $Items
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
        Write-Message -Message "Bulk sharing link removal completed successfully for $($Items.Count) item(s)." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to remove sharing link removal in bulk. Error: $errorDetails" -Level Error
    }
}
