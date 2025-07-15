<#
.SYNOPSIS
    Retrieves tag details from Microsoft Fabric.

.DESCRIPTION
    Retrieves tag information from Microsoft Fabric using either the TagId or TagName parameter.
    Handles authentication, constructs the API endpoint, sends the request, and returns matching tag(s).

.PARAMETER TagId
    The unique identifier of the tag to retrieve. Optional; specify either TagId or TagName, not both.

.PARAMETER TagName
    The display name of the tag to retrieve. Optional; specify either TagId or TagName, not both.

.EXAMPLE
    Get-FabricTag -TagId "tag-12345"
    Retrieves the tag with the ID "tag-12345".

.EXAMPLE
    Get-FabricTag -TagName "Finance"
    Retrieves the tag with the display name "Finance".

.NOTES
    - Requires the `$FabricConfig` global configuration object with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.
    - Only one of TagId or TagName should be specified.

    Author: Tiago Balabuch
#>
function Get-FabricTag {
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
        # Validate input parameters
        if ($TagId -and $TagName) {
            Write-Message -Message "Specify only one parameter: either 'TagId' or 'TagName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/tags" -f $FabricConfig.BaseUrl

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($TagId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $TagId }, 'First')
        }
        elseif ($TagName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $TagName }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Tags. Error: $errorDetails" -Level Error
    } 
 
}
