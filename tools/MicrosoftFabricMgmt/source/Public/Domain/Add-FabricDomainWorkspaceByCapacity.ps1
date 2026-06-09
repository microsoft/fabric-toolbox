<#
.SYNOPSIS
Assigns workspaces to a Fabric domain based on specified capacities.

.DESCRIPTION
The `Add-FabricDomainWorkspaceByCapacity` function assigns workspaces to a Fabric domain using a list of capacity IDs by making a POST request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the Fabric domain to which the workspaces will be assigned.

.PARAMETER CapacitiesIds
An array of capacity IDs used to assign workspaces to the domain.

.EXAMPLE
Add-FabricDomainWorkspaceByCapacity -DomainId "12345" -CapacitiesIds @("capacity1", "capacity2")

Assigns workspaces to the domain with ID "12345" based on the specified capacities.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricDomainWorkspaceByCapacity {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Assign-FabricDomainWorkspaceByCapacity')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [array]$CapacitiesIds
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains', $DomainId, 'assignWorkspacesByCapacities')
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            capacitiesIds = $CapacitiesIds
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, 'Assign workspaces to domain by capacities')) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Assigning domain workspaces by capacity completed successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error occurred while assigning workspaces by capacity for domain '$DomainId'. Details: $errorDetails" -Level Error
    }
}
