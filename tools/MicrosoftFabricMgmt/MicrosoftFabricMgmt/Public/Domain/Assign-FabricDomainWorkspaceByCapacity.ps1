<#
.SYNOPSIS
Assigns workspaces to a Fabric domain based on specified capacities.

.DESCRIPTION
The `Assign-FabricDomainWorkspaceByCapacity` function assigns workspaces to a Fabric domain using a list of capacity IDs by making a POST request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the Fabric domain to which the workspaces will be assigned.

.PARAMETER CapacitiesIds
An array of capacity IDs used to assign workspaces to the domain.

.EXAMPLE
Assign-FabricDomainWorkspaceByCapacity -DomainId "12345" -CapacitiesIds @("capacity1", "capacity2")

Assigns workspaces to the domain with ID "12345" based on the specified capacities.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch 
#>

function Assign-FabricDomainWorkspaceByCapacity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [array]$CapacitiesIds
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/assignWorkspacesByCapacities" -f $FabricConfig.BaseUrl, $DomainId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        
        # Construct the request body
        $body = @{
            capacitiesIds = $CapacitiesIds
        }
      
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Assigning domain workspaces by capacity completed successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Error occurred while assigning workspaces by capacity for domain '$DomainId'. Details: $errorDetails" -Level Error
    }
}
