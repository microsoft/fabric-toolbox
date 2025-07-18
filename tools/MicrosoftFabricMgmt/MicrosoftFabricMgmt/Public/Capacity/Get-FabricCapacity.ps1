
<#
.SYNOPSIS
    Retrieves capacity details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves capacity details from a specified workspace using either the provided CapacityId or CapacityName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER CapacityId
    The unique identifier of the capacity to retrieve. This parameter is optional.

.PARAMETER CapacityName
    The name of the capacity to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricCapacity -CapacityId "capacity-12345"
    This example retrieves the capacity details for the capacity with ID "capacity-12345".

.EXAMPLE
     Get-FabricCapacity -CapacityName "MyCapacity"
    This example retrieves the capacity details for the capacity named "MyCapacity".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricCapacity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityName
    )
    try {
        # Validate input parameters
        if ($CapacityId -and $CapacityName) {
            Write-Message -Message "Specify only one parameter: either 'CapacityId' or 'CapacityName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
 
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/capacities" -f $FabricConfig.BaseUrl
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
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
        if ($CapacityId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $CapacityId }, 'First')
        }
        elseif ($CapacityName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $CapacityName }, 'First')
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
        Write-Message -Message "Failed to retrieve capacity. Error: $errorDetails" -Level Error
    }
} 