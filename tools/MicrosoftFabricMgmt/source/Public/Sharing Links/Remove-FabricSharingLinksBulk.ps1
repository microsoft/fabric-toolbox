<#
.SYNOPSIS
Removes sharing links in bulk from the specified Fabric items.

.DESCRIPTION
Removes sharing links of a specified type (e.g., 'OrgLink') from the supplied set of Fabric items by sending a POST request to the admin bulkRemoveSharingLinks API. Each item must include 'id' and 'type' properties. Requires Fabric administrator permissions.

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
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Items, # Array with 'id' and 'type'

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('OrgLink')]
        $sharingLinkType = 'OrgLink'
    )

    process {
        try {
            # Validate Items structure
            foreach ($item in $Items) {
                if (-not ($item.id -and $item.type)) {
                    throw "Each Item must contain 'id' and 'type' properties. Found: $item"
                }
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/items/bulkRemoveSharingLinks" -f $script:FabricAuthContext.BaseUrl
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body
            $body = @{
                items = $Items
                sharingLinkType = $sharingLinkType
            }

            # Convert the body to JSON
            $bodyJson = $body | ConvertTo-Json -Depth 2
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Make the API request
            if ($PSCmdlet.ShouldProcess("$($Items.Count) item(s) with sharing link type '$sharingLinkType'", "Remove sharing links in bulk")) {
                $response = Invoke-FabricAPIRequest `
                    -BaseURI $apiEndpointURI `
                    -Headers $script:FabricAuthContext.FabricHeaders `
                    -Method Post `
                    -Body $bodyJson

                # Return the API response
                Write-FabricLog -Message "Bulk sharing link removal completed successfully for $($Items.Count) item(s)." -Level Host
                return $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove sharing link removal in bulk. Error: $errorDetails" -Level Error
        }
    }
}
