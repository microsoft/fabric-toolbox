<#
.SYNOPSIS
Retrieves Microsoft Fabric workspaces using admin API permissions.

.DESCRIPTION
The `Get-FabricWorkspaceAsAdmin` function fetches workspace details from the Fabric Admin API.
This endpoint requires admin permissions and provides additional filtering options not available
in the standard workspace API, including filtering by state (Active/Deleted), type, and capacity.

.PARAMETER WorkspaceName
Optional. Filter workspaces by display name.

.PARAMETER WorkspaceType
Optional. Filter workspaces by type. Valid values: Personal, Workspace, AdminWorkspace.

.PARAMETER WorkspaceState
Optional. Filter workspaces by state. Valid values: Active, Deleted.

.PARAMETER CapacityId
Optional. Filter workspaces by the capacity they are assigned to.

.EXAMPLE
Get-FabricWorkspaceAsAdmin

Retrieves all workspaces visible to the admin.

.EXAMPLE
Get-FabricWorkspaceAsAdmin -WorkspaceName "Finance"

Retrieves workspaces with the name "Finance".

.EXAMPLE
Get-FabricWorkspaceAsAdmin -WorkspaceState Deleted

Retrieves all deleted workspaces.

.EXAMPLE
Get-FabricWorkspaceAsAdmin -WorkspaceType Personal

Retrieves all personal workspaces.

.EXAMPLE
Get-FabricWorkspaceAsAdmin -CapacityId "00000000-0000-0000-0000-000000000000"

Retrieves all workspaces assigned to the specified capacity.

.NOTES
- Requires Fabric Admin permissions.
- Requires `$FabricAuthContext` module configuration.
- Supports pagination automatically via continuation tokens.
- Returns up to 10,000 records per API call.

Author: Tiago Balabuch
#>

function Get-FabricWorkspaceAsAdmin {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceName,

        [Parameter(Mandatory = $false)]
        [ValidateSet('Personal', 'Workspace', 'AdminWorkspace')]
        [string]$WorkspaceType,

        [Parameter(Mandatory = $false)]
        [ValidateSet('Active', 'Deleted')]
        [string]$WorkspaceState,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Build query parameters
        $queryParams = @{}

        if ($WorkspaceName) {
            $queryParams['name'] = $WorkspaceName
        }

        if ($WorkspaceType) {
            # API expects lowercase
            $queryParams['type'] = $WorkspaceType.ToLower()
        }

        if ($WorkspaceState) {
            # API expects lowercase
            $queryParams['state'] = $WorkspaceState.ToLower()
        }

        if ($CapacityId) {
            $queryParams['capacityId'] = $CapacityId
        }

        # Construct the API endpoint URI for admin workspaces
        $apiEndpointURI = "{0}/admin/workspaces" -f $script:FabricAuthContext.BaseUrl

        # Add query parameters if any
        if ($queryParams.Count -gt 0) {
            $queryString = ($queryParams.GetEnumerator() | ForEach-Object {
                $key = [System.Uri]::EscapeDataString($_.Key)
                $value = [System.Uri]::EscapeDataString($_.Value.ToString())
                "$key=$value"
            }) -join '&'
            $apiEndpointURI = "$apiEndpointURI`?$queryString"
        }

        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No workspaces returned from the admin API." -Level Warning
            return $null
        }

        # Add type decoration for custom formatting
        # Note: Admin API returns 'name' instead of 'displayName', so use AdminWorkspace type
        $dataItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminWorkspace'

        Write-FabricLog -Message "Retrieved $($dataItems.Count) workspace(s) from admin API." -Level Debug
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve workspaces from admin API. Error: $errorDetails" -Level Error
    }
}
