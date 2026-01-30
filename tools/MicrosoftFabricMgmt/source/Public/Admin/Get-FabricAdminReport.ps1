<#
.SYNOPSIS
    Gets reports from the admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminReport cmdlet retrieves Power BI reports using the admin API endpoint.
    This provides tenant-wide visibility into all reports (including those the user doesn't have access to).
    Requires Fabric Administrator permissions.

.PARAMETER WorkspaceId
    Optional. Filter reports by workspace ID.

.PARAMETER ReportId
    Optional. Returns only the report matching this ID. Requires WorkspaceId.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminReport

    Lists all reports in the tenant.

.EXAMPLE
    Get-FabricAdminReport -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all reports in the specified workspace.

.EXAMPLE
    Get-FabricAdminReport -WorkspaceId "12345678-1234-1234-1234-123456789012" -ReportId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the specific report.

.EXAMPLE
    Get-FabricAdminWorkspace | Get-FabricAdminReport

    Lists all reports from all workspaces via pipeline.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminReport {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate parameters
            if ($ReportId -and -not $WorkspaceId) {
                Write-FabricLog -Message "WorkspaceId is required when specifying ReportId." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # If ReportId and WorkspaceId provided, get specific report
            if ($ReportId -and $WorkspaceId) {
                $apiEndpointURI = "{0}/admin/workspaces/{1}/reports/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ReportId
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
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminReport')
                    return $response
                }
                return $null
            }

            # If WorkspaceId provided, get reports for that workspace
            if ($WorkspaceId) {
                $apiEndpointURI = "{0}/admin/workspaces/{1}/reports" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            }
            else {
                # Get all reports in tenant
                $apiEndpointURI = "{0}/admin/reports" -f $script:FabricAuthContext.BaseUrl
            }

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No reports returned from admin API." -Level Warning
                return $null
            }

            # Use Select-FabricResource for type decoration
            return Select-FabricResource -InputObject $response -ResourceType 'AdminReport' -TypeName 'MicrosoftFabric.AdminReport' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve reports from admin API. Error: $errorDetails" -Level Error
        }
    }
}
