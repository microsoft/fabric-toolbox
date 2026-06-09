<#
.SYNOPSIS
    Gets workspace scan status using the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminWorkspaceScanStatus cmdlet retrieves the status of a workspace scan operation using the admin API.

.PARAMETER ScanId
    Required. The scan ID to get status for.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminWorkspaceScanStatus -ScanId "scan123"

    Gets the status of a specific workspace scan.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/workspaces/scanStatus/{scanId}
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminWorkspaceScanStatus {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ScanId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/workspaces/scanStatus/$ScanId"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($response) {
                if ($Raw) {
                    return $response
                }
                $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminWorkspaceScanStatus')
                return $response
            }
            return $null
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve workspace scan status. Error: $errorDetails" -Level Error
        }
    }
}
