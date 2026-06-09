<#
.SYNOPSIS
    Gets users that have access to a Power BI app.

.DESCRIPTION
    The Get-FabricAdminAppUser cmdlet retrieves users with access to a specific Power BI app using the admin API.

.PARAMETER AppId
    Required. The ID of the app.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminAppUser -AppId "12345678-1234-1234-1234-123456789012"

    Lists all users with access to the specified app.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/apps/{appId}/users
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Get-FabricAdminAppUser {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [Alias('id')]
        [ValidateNotNullOrEmpty()]
        [string]$AppId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/apps/$AppId/users"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No users returned." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Add context property
            foreach ($user in $response) {
                $user | Add-Member -NotePropertyName 'appId' -NotePropertyValue $AppId -Force
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminAppUser'
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve app users. Error: $errorDetails" -Level Error
        }
    }
}
