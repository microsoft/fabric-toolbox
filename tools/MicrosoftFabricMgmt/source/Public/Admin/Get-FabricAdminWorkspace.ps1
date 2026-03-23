<#
.SYNOPSIS
    Gets workspaces from the admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminWorkspace cmdlet retrieves workspaces using the admin API endpoint.
    This provides tenant-wide visibility into all workspaces (including those the user doesn't have access to).
    Requires Fabric Administrator permissions.

    When called without parameters, lists all workspaces in the tenant.
    When piped with capacity objects, retrieves workspaces for each capacity.

.PARAMETER WorkspaceId
    Optional. Workspace ID to retrieve a specific workspace. Accepts pipeline input.
    When provided, returns only the workspace matching this ID.

.PARAMETER CapacityId
    Optional. Capacity ID to filter workspaces assigned to a specific capacity.
    Accepts pipeline input from Get-FabricAdminCapacity via the 'id' property.

.PARAMETER WorkspaceName
    Optional. Filter workspaces by display name (substring match).

.PARAMETER WorkspaceType
    Optional. Filter by workspace type. Valid values: personal, workspace, adminworkspace.

.PARAMETER State
    Optional. Filter by workspace state. Valid values: active, deleted.

.PARAMETER Filter
    Optional. OData filter expression for advanced filtering.
    Example: "contains(displayName,'Sales') and state eq 'Active'"

.PARAMETER Top
    Optional. Maximum number of workspaces to return (1-5000). Default returns all.

.PARAMETER Skip
    Optional. Number of workspaces to skip for pagination.

.PARAMETER OrderBy
    Optional. OData orderby expression for sorting results.
    Example: "displayName" or "displayName desc"

.PARAMETER ContinuationToken
    Optional. Token for retrieving next page of results in paginated responses.

.PARAMETER Raw
    Optional. When specified, returns the raw API response without type decoration.

.EXAMPLE
    Get-FabricAdminWorkspace

    Lists all workspaces in the tenant (no parameters required).

.EXAMPLE
    Get-FabricAdminWorkspace -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Returns the specific workspace with the given ID.

.EXAMPLE
    Get-FabricAdminCapacity | Get-FabricAdminWorkspace

    Gets all workspaces for each capacity returned from Get-FabricAdminCapacity.
    This is the recommended way to iterate through workspaces by capacity.

.EXAMPLE
    Get-FabricAdminWorkspace -WorkspaceType "workspace" -State "active"

    Lists all active workspaces (excluding personal workspaces).

.EXAMPLE
    Get-FabricAdminWorkspace -CapacityId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists all workspaces assigned to a specific capacity.

.EXAMPLE
    Get-FabricAdminWorkspace -Filter "contains(displayName,'Sales')" -Top 100

    Lists first 100 workspaces with 'Sales' in the name, using OData filter.

.EXAMPLE
    Get-FabricAdminWorkspace -Top 50 -Skip 100

    Gets workspaces 101-150 (pagination).

.NOTES
    - API Endpoint: GET /v1/admin/workspaces
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
    - Supports OData query syntax for advanced filtering and sorting.
    - Reference: https://learn.microsoft.com/rest/api/fabric/admin/workspaces/list-workspaces

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminWorkspace {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceName,

        [Parameter(Mandatory = $false)]
        [ValidateSet('personal', 'workspace', 'adminworkspace')]
        [string]$WorkspaceType,

        [Parameter(Mandatory = $false)]
        [ValidateSet('active', 'deleted')]
        [string]$State,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Filter,

        [Parameter(Mandatory = $false)]
        [ValidateRange(1, 5000)]
        [int]$Top,

        [Parameter(Mandatory = $false)]
        [ValidateRange(0, [int]::MaxValue)]
        [int]$Skip,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OrderBy,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ContinuationToken,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # If specific WorkspaceId provided, get that specific workspace
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
                    if (-not $Raw) {
                        $response.PSObject.TypeNames.Insert(0, 'MicrosoftFabric.AdminWorkspace')
                    }
                    $response
                }
                return
            }

            # Build query parameters for list operation
            $queryParams = [System.Collections.Generic.List[string]]::new()

            if ($CapacityId) {
                $queryParams.Add("capacityId=$CapacityId")
            }
            if ($WorkspaceName) {
                # Note: API may use 'name' or 'displayName' for filtering
                $queryParams.Add("name=$([System.Uri]::EscapeDataString($WorkspaceName))")
            }
            if ($WorkspaceType) {
                $queryParams.Add("type=$WorkspaceType")
            }
            if ($State) {
                $queryParams.Add("state=$State")
            }
            if ($Filter) {
                # OData filter parameter
                $queryParams.Add("`$filter=$([System.Uri]::EscapeDataString($Filter))")
            }
            if ($Top) {
                $queryParams.Add("`$top=$Top")
            }
            if ($Skip) {
                $queryParams.Add("`$skip=$Skip")
            }
            if ($OrderBy) {
                $queryParams.Add("`$orderby=$([System.Uri]::EscapeDataString($OrderBy))")
            }
            if ($ContinuationToken) {
                $queryParams.Add("continuationToken=$([System.Uri]::EscapeDataString($ContinuationToken))")
            }

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/workspaces" -f $script:FabricAuthContext.BaseUrl
            if ($queryParams.Count -gt 0) {
                $queryString = $queryParams -join '&'
                $apiEndpointURI = "$apiEndpointURI`?$queryString"
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

            # Use Select-FabricResource for type decoration
            Select-FabricResource -InputObject $response -DisplayName $WorkspaceName -ResourceType 'AdminWorkspace' -TypeName 'MicrosoftFabric.AdminWorkspace' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve workspaces from admin API. Error: $errorDetails" -Level Error
        }
    }
}
