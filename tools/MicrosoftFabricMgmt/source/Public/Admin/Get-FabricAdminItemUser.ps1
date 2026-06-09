<#
.SYNOPSIS
    Gets users with access to a specific item using the admin API.

.DESCRIPTION
    The Get-FabricAdminItemUser cmdlet retrieves users (including groups and service principals)
    that have access to the specified item using the admin API endpoint.
    Requires Fabric Administrator permissions.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the item.

.PARAMETER ItemId
    The GUID of the item to get users for.

.PARAMETER ItemType
    Optional. The type of the item. Required for Report, Dashboard, SemanticModel, App, and Dataflow.

.PARAMETER Raw
    Optional. When specified, returns the raw API response.

.EXAMPLE
    Get-FabricAdminItemUser -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Lists all users with access to the specified item.

.EXAMPLE
    Get-FabricAdminItemUser -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -ItemType "Report"

    Lists all users with access to the specified Report item.

.NOTES
    - Requires Fabric Administrator permissions or service principal with Tenant.Read.All scope.
    - Rate limited to 200 requests per hour.
    - This is a preview API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricAdminItemUser {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
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

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/admin/workspaces/{1}/items/{2}/users" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $ItemId

            # Add type query parameter if specified
            if ($ItemType) {
                $apiEndpointURI = "{0}?type={1}" -f $apiEndpointURI, $ItemType
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
                Write-FabricLog -Message "No users returned from admin API for item '$ItemId'." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            # Add context and type name for formatting
            foreach ($user in $response) {
                $user | Add-Member -NotePropertyName 'workspaceId' -NotePropertyValue $WorkspaceId -Force
                $user | Add-Member -NotePropertyName 'itemId' -NotePropertyValue $ItemId -Force
            }
            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.AdminItemUser'

            Write-FabricLog -Message "Retrieved $($response.Count) user(s) for item '$ItemId'." -Level Debug
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve item users from admin API. Error: $errorDetails" -Level Error
        }
    }
}
