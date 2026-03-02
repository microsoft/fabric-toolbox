<#
.SYNOPSIS
    Gets workspaces from the admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminWorkspace cmdlet retrieves workspaces using the admin API endpoint.
    This provides tenant-wide visibility into all workspaces (including those the user doesn't have access to).
    Requires Fabric Administrator permissions.

.PARAMETER WorkspaceId
    Optional. Returns only the workspace matching this ID.

.PARAMETER WorkspaceName
    Optional. Filter workspaces by name.

.PARAMETER WorkspaceType
    Optional. Filter by workspace type. Valid values: personal, workspace, adminworkspace.

.PARAMETER CapacityId
    Optional. Filter workspaces by capacity ID.

.PARAMETER State
    Optional. Filter by workspace state. Valid values: active, deleted.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminWorkspace

    Lists all workspaces in the tenant.

.EXAMPLE
    Get-FabricAdminWorkspace -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Returns the workspace with the specified ID.

.EXAMPLE
    Get-FabricAdminWorkspace -WorkspaceType "workspace" -State "active"

    Lists all active workspaces (excluding personal workspaces).

.EXAMPLE
    Get-FabricAdminWorkspace -CapacityId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists all workspaces on the specified capacity.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminWorkspace {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceName,

        [Parameter(Mandatory = $false)]
        [ValidateSet('personal', 'workspace', 'adminworkspace')]
        [string]$WorkspaceType,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateSet('active', 'deleted')]
        [string]$State,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # If WorkspaceId provided, get specific workspace
            if ($WorkspaceId) {
                $apiEndpointURI = "{0}/admin/workspaces/{1}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
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
                    $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminWorkspace')
                    return $response
                }
                return $null
            }

            # Build query parameters for list operation
            $queryParams = @{}
            if ($WorkspaceName) {
                $queryParams['name'] = $WorkspaceName
            }
            if ($WorkspaceType) {
                $queryParams['type'] = $WorkspaceType
            }
            if ($CapacityId) {
                $queryParams['capacityId'] = $CapacityId
            }
            if ($State) {
                $queryParams['state'] = $State
            }

            # Construct the API endpoint URI
            $uriParams = @{
                BaseUrl  = $script:FabricAuthContext.BaseUrl
                Endpoint = 'admin/workspaces'
            }
            if ($queryParams.Count -gt 0) {
                $queryString = ($queryParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '&'
                $apiEndpointURI = "{0}/{1}?{2}" -f $script:FabricAuthContext.BaseUrl, 'admin/workspaces', $queryString
            }
            else {
                $apiEndpointURI = "{0}/{1}" -f $script:FabricAuthContext.BaseUrl, 'admin/workspaces'
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
                Write-FabricLog -Message "No workspaces returned from admin API." -Level Warning
                return $null
            }

            # Use Select-FabricResource for filtering and type decoration
            return Select-FabricResource -InputObject $response -DisplayName $WorkspaceName -ResourceType 'AdminWorkspace' -TypeName 'MicrosoftFabric.AdminWorkspace' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve workspaces from admin API. Error: $errorDetails" -Level Error
        }
    }
}
