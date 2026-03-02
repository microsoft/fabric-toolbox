
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

.PARAMETER Raw
    If specified, returns the raw API response without type decoration.

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
        [string]$CapacityName,

        [Parameter()]
        [switch]$Raw
    )
    try {
        # Validate input parameters
        if ($CapacityId -and $CapacityName) {
            Write-FabricLog -Message "Specify only one parameter: either 'CapacityId' or 'CapacityName'." -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'capacities'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering and output results with type decoration
        Select-FabricResource -InputObject $dataItems -Id $CapacityId -DisplayName $CapacityName -ResourceType 'Capacity' -TypeName 'MicrosoftFabric.Capacity' -Raw:$Raw
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve capacity. Error: $errorDetails" -Level Error
    }
}
