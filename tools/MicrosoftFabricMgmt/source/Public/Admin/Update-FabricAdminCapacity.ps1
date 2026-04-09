<#
.SYNOPSIS
    Updates a capacity using the Power BI admin API.

.DESCRIPTION
    The Update-FabricAdminCapacity cmdlet updates properties of a capacity using the admin API.

.PARAMETER CapacityId
    Required. The capacity ID to update.

.PARAMETER DisplayName
    Optional. The new display name for the capacity.

.PARAMETER Notes
    Optional. Notes about the capacity.

.EXAMPLE
    Update-FabricAdminCapacity -CapacityId "capacity123" -DisplayName "Production Capacity"

    Updates the display name of a capacity.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/capacities/{capacityId}
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Update-FabricAdminCapacity {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DisplayName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Notes
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/capacities/$CapacityId"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{}
            if ($DisplayName) {
                $body.displayName = $DisplayName
            }
            if ($Notes) {
                $body.notes = $Notes
            }

            $bodyJson = if ($body.Count -gt 0) { $body | ConvertTo-Json -Depth 10 } else { '{}' }

            if ($PSCmdlet.ShouldProcess("Capacity '$CapacityId'", "Update")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Patch'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Capacity '$CapacityId' updated successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update capacity. Error: $errorDetails" -Level Error
        }
    }
}
