<#
.SYNOPSIS
    Gets users with access to a workspace using the admin API.

.DESCRIPTION
    The Get-FabricAdminWorkspaceUser cmdlet retrieves users (including groups and service principals)
    that have access to the specified workspace using the admin API endpoint.
    Requires Fabric Administrator permissions.

.PARAMETER WorkspaceId
    The GUID of the workspace to get users for. This parameter is mandatory.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminWorkspaceUser -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all users with access to the specified workspace.

.EXAMPLE
    Get-FabricAdminWorkspace | ForEach-Object { Get-FabricAdminWorkspaceUser -WorkspaceId $_.id }

    Lists users for all workspaces in the tenant.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminWorkspaceUser {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/workspaces/{1}/users" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No users returned from admin API for workspace '$WorkspaceId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Add workspace context and type name for formatting
            foreach ($user in $response) {
                $user | Add-Member -NotePropertyName 'workspaceId' -NotePropertyValue $WorkspaceId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminWorkspaceUser'

            Write-FabricLog -Message "Retrieved $($response.Count) user(s) for workspace '$WorkspaceId'." -Level Debug
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve workspace users from admin API. Error: $errorDetails" -Level Error
        }
    }
}
