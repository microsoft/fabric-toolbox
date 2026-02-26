<#
.SYNOPSIS
    Gets OneLake data access roles for a Fabric item.

.DESCRIPTION
    The Get-FabricOneLakeDataAccessRole cmdlet retrieves OneLake data access roles
    for a specified Fabric item within a workspace.

    When RoleName is provided, retrieves a single specific role using the preview API
    endpoint (GET /dataAccessRoles/{roleName}?preview=true).

    When RoleName is omitted, lists all data access roles using the list API endpoint
    (GET /dataAccessRoles). Pagination is handled automatically.

    PREVIEW API NOTICE: These endpoints are part of a Microsoft Fabric Preview release,
    provided for evaluation and development purposes only. They may change based on feedback
    and are not recommended for production use. Only read operations are implemented in this
    module; data-changing operations (create, update, delete) are not available.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Fabric item. Mandatory.
    Accepts pipeline input by property name (binds to the 'workspaceId' property on objects
    returned by Get-FabricItem and similar commands).

.PARAMETER ItemId
    The GUID of the Fabric item whose data access roles you want to retrieve. Mandatory.
    Accepts pipeline input by property name. Also accepts the 'id' property alias, so objects
    returned by Get-FabricItem can be piped directly.

.PARAMETER RoleName
    Optional. The name of a specific role to retrieve. When specified, calls the preview
    Get Data Access Role endpoint. When omitted, all data access roles are listed.

.PARAMETER Raw
    Optional. When specified, returns the raw API response without type decoration.

.EXAMPLE
    Get-FabricOneLakeDataAccessRole -WorkspaceId "11111111-2222-3333-4444-555555555555" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists all data access roles for the specified Fabric item. All pages of results are
    returned automatically.

.EXAMPLE
    Get-FabricOneLakeDataAccessRole -WorkspaceId "11111111-2222-3333-4444-555555555555" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -RoleName "DefaultReader"

    Retrieves the specific 'DefaultReader' data access role using the preview API endpoint.

.EXAMPLE
    $ws = Get-FabricWorkspace -WorkspaceName "MyWorkspace"
    Get-FabricItem -WorkspaceId $ws.id -DisplayName "MyLakehouse" | Get-FabricOneLakeDataAccessRole

    Lists all data access roles for a Lakehouse item by piping directly from Get-FabricItem.
    The piped object's 'workspaceId' property binds to WorkspaceId and its 'id' property binds to ItemId.

.EXAMPLE
    Get-FabricItem -WorkspaceId "11111111-2222-3333-4444-555555555555" | Get-FabricOneLakeDataAccessRole

    Retrieves data access roles for all items in the workspace by piping from Get-FabricItem.

.NOTES
    - Caller must have member or higher role on the workspace.
    - Required delegated scopes: OneLake.Read.All or OneLake.ReadWrite.All
    - PREVIEW: This API is part of a preview release and may change without notice.
      It is not recommended for production use.
    - Only read operations are implemented. Create, update, and delete are not supported
      by this module.
    - API Reference: https://learn.microsoft.com/en-us/rest/api/fabric/core/onelake-data-access-security

    Author: Rob Sewell
#>
function Get-FabricOneLakeDataAccessRole {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RoleName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            if ($RoleName) {
                # Get a specific role by name
                # NOTE: This endpoint requires the ?preview=true query parameter per the API specification.
                $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/dataAccessRoles/{3}?preview=true" -f `
                    $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ItemId, $RoleName
                Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No data access role '$RoleName' found for item '$ItemId' in workspace '$WorkspaceId'." -Level Verbose
                    return
                }

                if ($Raw) {
                    return $response
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.OneLakeDataAccessRole'
                return $response
            }
            else {
                # List all data access roles for the item. Invoke-FabricAPIRequest handles pagination automatically.
                $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/dataAccessRoles" -f `
                    $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ItemId
                Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No data access roles found for item '$ItemId' in workspace '$WorkspaceId'." -Level Verbose
                    return
                }

                return Select-FabricResource -InputObject $response -ResourceType 'OneLakeDataAccessRole' -TypeName 'MicrosoftFabric.OneLakeDataAccessRole' -Raw:$Raw
            }
        }
        catch {
            # Full technical details at Debug for troubleshooting
            Write-FabricLog -Message "Failed to retrieve OneLake data access role(s) for item '$ItemId' in workspace '$WorkspaceId'. Full error: $($_.Exception.Message)" -Level Debug

            # Resolve the structured error response from whichever source is available:
            #   PS5.1: Invoke-RestMethod throws, $_.ErrorDetails.Message = raw HTTP response body (JSON)
            #   PS7:   Invoke-RestMethod succeeds (SkipHttpErrorCheck), manual throw has no ErrorDetails,
            #          but Invoke-FabricAPIRequest stores the parsed response in $script:FabricLastAPIError
            $errorSource = $null
            if ($_.ErrorDetails.Message) {
                try {
                    $errorSource = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction Stop
                }
                catch {
                    # Not valid JSON - fall through to $script:FabricLastAPIError
                }
            }
            if (-not $errorSource) {
                $errorSource = $script:FabricLastAPIError
            }

            # Build a neat, user-facing message from the structured error data
            $msgLines = @("Unable to retrieve OneLake data access role(s) for item '$ItemId' in workspace '${WorkspaceId}':")
            if ($errorSource -and $errorSource.moreDetails -and $errorSource.moreDetails.Count -gt 0) {
                foreach ($detail in $errorSource.moreDetails) {
                    if ($detail.message) {
                        $line = "  $($detail.message)"
                        if ($detail.errorCode) { $line += " [$($detail.errorCode)]" }
                        $msgLines += $line
                    }
                }
            }
            elseif ($errorSource -and $errorSource.message) {
                $msgLines += "  $($errorSource.message)"
            }
            else {
                $msgLines += "  $($_.Exception.Message)"
            }

            Write-FabricLog -Message ($msgLines -join "`n") -Level Warning
        }
    }
}
