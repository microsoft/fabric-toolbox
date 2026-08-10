<#
.SYNOPSIS
    Gets workspaces from the admin API for tenant-wide visibility.

.DESCRIPTION
    The Get-FabricAdminWorkspace cmdlet retrieves workspaces using the Fabric admin API endpoint
    (GET /v1/admin/workspaces). This provides tenant-wide visibility into all workspaces
    (including those the caller does not have access to). Requires Fabric Administrator permissions
    or a service principal with the Tenant.Read.All scope.

    When called without parameters, lists all workspaces in the tenant (auto-paginating through
    all pages). Server-side filtering is available via -CapacityId, -WorkspaceName, -WorkspaceType,
    -State and -EncryptionStatus. When piped with capacity objects, retrieves workspaces per capacity.

    NOTE: this endpoint does NOT support OData query options ($filter / $top / $skip / $orderby).
    Filtering is done with the named parameters above; for client-side limiting/sorting pipe the
    result to Select-Object / Sort-Object.

.PARAMETER WorkspaceId
    Optional. Workspace ID to retrieve a specific workspace. Accepts pipeline input.
    When provided, returns only the workspace matching this ID.

.PARAMETER CapacityId
    Optional. Capacity ID to filter workspaces assigned to a specific capacity.
    Accepts pipeline input from Get-FabricAdminCapacity via the 'id' property.

.PARAMETER WorkspaceName
    Optional. Filter workspaces by name (maps to the API 'name' query parameter).

.PARAMETER WorkspaceType
    Optional. Filter by workspace type. Valid values: personal, workspace, adminworkspace.

.PARAMETER State
    Optional. Filter by workspace state. Valid values: active, deleted.

.PARAMETER EncryptionStatus
    Optional. Filter by customer-managed-key (CMK) encryption status. Valid values:
    Disabled, Active, EnableInProgress, DisableInProgress, Failed.
    The API only applies this filter when encryption data is included, so specifying
    -EncryptionStatus automatically sets -Include to 'encryption' unless you set -Include yourself.

.PARAMETER Include
    Optional. Additional data to include for each workspace. Valid values: encryption.

.PARAMETER ContinuationToken
    Optional. Token for retrieving the next page of results. The cmdlet auto-paginates by default;
    supply this only to resume from a specific token.

.PARAMETER Raw
    Optional. When specified, returns the raw API response without added names or type decoration.

.EXAMPLE
    Get-FabricAdminWorkspace

    Lists all workspaces in the tenant (no parameters required).

.EXAMPLE
    Get-FabricAdminWorkspace -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Returns the specific workspace with the given ID.

.EXAMPLE
    Get-FabricAdminCapacity | Get-FabricAdminWorkspace

    Gets all workspaces for each capacity returned from Get-FabricAdminCapacity.

.EXAMPLE
    Get-FabricAdminWorkspace -WorkspaceType "workspace" -State "active"

    Lists all active workspaces (excluding personal workspaces).

.EXAMPLE
    Get-FabricAdminWorkspace -CapacityId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists all workspaces assigned to a specific capacity.

.EXAMPLE
    Get-FabricAdminWorkspace -WorkspaceName "Sales"

    Lists workspaces whose name matches 'Sales' (server-side 'name' filter).

.EXAMPLE
    Get-FabricAdminWorkspace -EncryptionStatus 'Active'

    Lists workspaces with active CMK encryption (automatically includes encryption details).

.EXAMPLE
    Get-FabricAdminWorkspace | Where-Object { $_.name -like '*Sales*' -and $_.state -eq 'Active' } | Select-Object -First 100

    Client-side filtering/limiting example (the endpoint does not support OData $filter/$top).

.NOTES
    - API Endpoint: GET /v1/admin/workspaces
    - Supported query parameters: capacityId, name, type, state, encryptionStatus, include, continuationToken.
    - NOT supported: OData $filter, $top, $skip, $orderby. Use the named filters or client-side cmdlets.
    - Requires Fabric Administrator permissions or a service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
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
        [ValidateSet('Disabled', 'Active', 'EnableInProgress', 'DisableInProgress', 'Failed')]
        [string]$EncryptionStatus,

        [Parameter(Mandatory = $false)]
        [ValidateSet('encryption')]
        [string]$Include,

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

            # The encryptionStatus filter is only applied when encryption data is included.
            if ($EncryptionStatus -and -not $Include) {
                $Include = 'encryption'
            }

            # Build query parameters for the list operation. Only the parameters the Fabric admin
            # workspaces endpoint actually supports are sent (no OData $filter/$top/$skip/$orderby).
            $queryParams = [System.Collections.Generic.List[string]]::new()

            if ($CapacityId) {
                $queryParams.Add("capacityId=$CapacityId")
            }
            if ($WorkspaceName) {
                $queryParams.Add("name=$([System.Uri]::EscapeDataString($WorkspaceName))")
            }
            if ($WorkspaceType) {
                $queryParams.Add("type=$WorkspaceType")
            }
            if ($State) {
                $queryParams.Add("state=$State")
            }
            if ($EncryptionStatus) {
                $queryParams.Add("encryptionStatus=$EncryptionStatus")
            }
            if ($Include) {
                $queryParams.Add("include=$Include")
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

            # Enrich + type-decorate. Do NOT client-side filter by -DisplayName here: the admin
            # API returns 'name' (not 'displayName'), and the server already applied the 'name'
            # filter above, so re-filtering on displayName would drop every row.
            Select-FabricResource -InputObject $response -ResourceType 'AdminWorkspace' -TypeName 'MicrosoftFabric.AdminWorkspace' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve workspaces from admin API. Error: $errorDetails" -Level Error
        }
    }
}
