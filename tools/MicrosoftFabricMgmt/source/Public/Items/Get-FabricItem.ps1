<#
.SYNOPSIS
    Gets items from a Microsoft Fabric workspace.

.DESCRIPTION
    The Get-FabricItem cmdlet retrieves Fabric items from a specified workspace.

    When ItemId is provided, retrieves a single specific item using the Get Item endpoint
    (GET /workspaces/{workspaceId}/items/{itemId}).

    When ItemId is omitted, lists all items in the workspace using the List Items endpoint
    (GET /workspaces/{workspaceId}/items). Pagination is handled automatically.

    An optional ItemType filter can be used to narrow results to a specific item type
    (e.g. Lakehouse, Notebook, Warehouse).

.PARAMETER WorkspaceId
    The GUID of the workspace to retrieve items from. Mandatory.
    Accepts pipeline input by property name. Also accepts the 'id' property alias, so workspace
    objects returned by Get-FabricWorkspace can be piped directly.

.PARAMETER ItemId
    Optional. The GUID of a specific item to retrieve.

.PARAMETER ItemType
    Optional. Filters the item list to a specific type (e.g. Lakehouse, Notebook, Warehouse).
    Has no effect when ItemId is specified.

.PARAMETER Raw
    Optional. When specified, returns the raw API response without type decoration.

.EXAMPLE
    Get-FabricItem -WorkspaceId "11111111-2222-3333-4444-555555555555"

    Lists all items in the specified workspace.

.EXAMPLE
    Get-FabricItem -WorkspaceId "11111111-2222-3333-4444-555555555555" -ItemType "Lakehouse"

    Lists all Lakehouse items in the workspace.

.EXAMPLE
    Get-FabricItem -WorkspaceId "11111111-2222-3333-4444-555555555555" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Retrieves a single item by ID.

.EXAMPLE
    Get-FabricWorkspace -WorkspaceName "MyWorkspace" | Get-FabricItem

    Lists all items in a workspace by piping from Get-FabricWorkspace.
    The workspace object's 'id' property binds to WorkspaceId.

.EXAMPLE
    Get-FabricWorkspace -WorkspaceName "MyWorkspace" | Get-FabricItem | Get-FabricOneLakeDataAccessRole

    Retrieves OneLake data access roles for every item in a workspace using the pipeline.

.NOTES
    - Requires Member or higher role on the workspace.
    - Required delegated scopes: Item.Read.All or Item.ReadWrite.All
    - API Reference: https://learn.microsoft.com/en-us/rest/api/fabric/core/items

    Author: Rob Sewell
#>
function Get-FabricItem {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemType,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            if ($ItemId) {
                # Get a specific item by ID
                $apiEndpointURI = "{0}/workspaces/{1}/items/{2}" -f `
                    $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ItemId
                Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No item '$ItemId' found in workspace '$WorkspaceId'." -Level Verbose
                    return
                }

                if ($Raw) {
                    return $response
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.Item'
                return $response
            }
            else {
                # List all items in the workspace. Invoke-FabricAPIRequest handles pagination automatically.
                $apiEndpointURI = "{0}/workspaces/{1}/items" -f `
                    $script:FabricAuthContext.BaseUrl, $WorkspaceId
                if ($ItemType) {
                    $apiEndpointURI += "?type=$([System.Uri]::EscapeDataString($ItemType))"
                }
                Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Get'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No items found in workspace '$WorkspaceId'." -Level Verbose
                    return
                }

                return Select-FabricResource -InputObject $response -ResourceType 'Item' -TypeName 'MicrosoftFabric.Item' -Raw:$Raw
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve item(s) in workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
