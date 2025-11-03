<#
.SYNOPSIS
    Creates one or more tags in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create tags in bulk within a specified workspace.
    Each tag object must include a 'displayName' property. The function validates the authentication token before proceeding.

.PARAMETER Tags
    An array of tag objects, each containing at least a 'displayName' property. This parameter is mandatory.

.EXAMPLE
    $tags = @(
        @{ displayName = "Finance" },
        @{ displayName = "HR" }
    )
    New-FabricTag -Tags $tags
    This example creates two tags, "Finance" and "HR", in the target workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Author: Tiago Balabuch
#>
function New-FabricTag {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Tags # Array with 'displayName' 
    )
    try {
        # Validate Items structure
        foreach ($tag in $Tags) {
            if (-not ($tag.displayName)) {
                throw "Each Tag must contain 'displayName' property. Found: $tag"
            }
        }
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/tags/bulkCreateTags" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        # Convert the body to JSON format
        $bodyJson = $Tags | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Tags created successfully!" -Level Info        
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Tags. Error: $errorDetails" -Level Error
    }
}