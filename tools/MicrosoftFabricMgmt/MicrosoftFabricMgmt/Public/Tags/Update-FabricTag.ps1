<#
.SYNOPSIS
    Updates an existing tag in Microsoft Fabric.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update the display name of a tag.
    Validates authentication before making the request.

.PARAMETER TagId
    The unique identifier of the tag to update.

.PARAMETER TagName
    The new display name for the tag.

.EXAMPLE
    Update-FabricTag -TagId "tag-12345" -TagName "Updated Tag Name"
    Updates the tag with ID "tag-12345" to have the display name "Updated Tag Name".

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Calls `Test-TokenExpired` to ensure the authentication token is valid.

    Author: Tiago Balabuch
#>
function Update-FabricTag {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TagId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$TagName
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                PATCH https://api.fabric.microsoft.com/v1/admin/tags/{tagId}
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/tags/{1}" -f $FabricConfig.BaseUrl, $TagId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $TagName
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug
        
        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
            # Return the API response
        Write-Message -Message "Tag '$TagName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Tag. Error: $errorDetails" -Level Error
    }
}
