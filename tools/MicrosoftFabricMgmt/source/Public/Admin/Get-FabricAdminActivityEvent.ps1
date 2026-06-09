<#
.SYNOPSIS
    Gets activity events from the Power BI admin API.

.DESCRIPTION
    The Get-FabricAdminActivityEvent cmdlet retrieves activity events using the admin API. Requires date range parameters.

.PARAMETER StartDateTime
    Required. The start date and time for the activity events (ISO 8601 format: yyyy-MM-ddTHH:mm:ss.sssZ or yyyy-MM-dd).

.PARAMETER EndDateTime
    Required. The end date and time for the activity events (ISO 8601 format: yyyy-MM-ddTHH:mm:ss.sssZ or yyyy-MM-dd).

.PARAMETER Filter
    Optional. OData filter expression.

.PARAMETER Top
    Optional. Maximum number of items to return.

.PARAMETER Skip
    Optional. Number of items to skip.

.PARAMETER Raw
    Optional. Returns raw API response.

.EXAMPLE
    Get-FabricAdminActivityEvent -StartDateTime "2024-01-01" -EndDateTime "2024-01-31"

    Gets all activity events for January 2024.

.EXAMPLE
    Get-FabricAdminActivityEvent -StartDateTime "2024-01-01T00:00:00Z" -EndDateTime "2024-01-01T23:59:59Z"

    Gets all activity events for a specific day.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/activityevents
    - Requires Fabric Administrator permissions.
    - Activity events are typically available for 30 days.

    Author: Claude AI
#>
function Get-FabricAdminActivityEvent {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StartDateTime,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EndDateTime,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Filter,

        [Parameter(Mandatory = $false)]
        [ValidateRange(1, 5000)]
        [int]$Top,

        [Parameter(Mandatory = $false)]
        [ValidateRange(0, [int]::MaxValue)]
        [int]$Skip,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"

            $queryParams = @()
            $queryParams += "startDateTime=$([System.Uri]::EscapeDataString($StartDateTime))"
            $queryParams += "endDateTime=$([System.Uri]::EscapeDataString($EndDateTime))"

            if ($Filter) {
                $queryParams += "`$filter=$([System.Uri]::EscapeDataString($Filter))"
            }
            if ($Top) {
                $queryParams += "`$top=$Top"
            }
            if ($Skip) {
                $queryParams += "`$skip=$Skip"
            }

            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/activityevents`?$($queryParams -join '&')"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No activity events returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            return Select-FabricResource -InputObject $response -ResourceType 'AdminActivityEvent' -TypeName 'MicrosoftFabric.AdminActivityEvent' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve activity events. Error: $errorDetails" -Level Error
        }
    }
}
