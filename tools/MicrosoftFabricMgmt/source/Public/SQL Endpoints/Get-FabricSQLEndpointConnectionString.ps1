<#
.SYNOPSIS
    Retrieves the connection string for a specific SQL Endpoint in a Fabric workspace.

.DESCRIPTION
    The Get-FabricSQLEndpointConnectionString function retrieves the connection string for a given SQL Endpoint
    within a specified Fabric workspace. It supports optional parameters for guest tenant access and private link type.
    The function validates authentication, constructs the appropriate API endpoint, and returns the connection string.

.PARAMETER WorkspaceId
    The ID of the workspace containing the SQL Endpoint. This parameter is mandatory.

.PARAMETER SQLEndpointId
    The ID of the SQL Endpoint for which to retrieve the connection string. This parameter is mandatory.

.PARAMETER GuestTenantId
    (Optional) The tenant ID for guest access, if applicable.

.PARAMETER PrivateLinkType
    (Optional) The type of private link to use for the connection string. Valid values are 'None' or 'Workspace'.

.EXAMPLE
    Get-FabricSQLEndpointConnectionString -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"
    Retrieves the connection string for the SQL Endpoint with ID "endpoint456" in workspace "workspace123".

.EXAMPLE
    Get-FabricSQLEndpointConnectionString -WorkspaceId "workspace123" -SQLEndpointId "endpoint456" -GuestTenantId "guestTenant789" -PrivateLinkType "Workspace"
    Retrieves the connection string with guest tenant access and workspace private link type.

.EXAMPLE
    Get-FabricSQLEndpoint -WorkspaceId "workspace123" | Get-FabricSQLEndpointConnectionString
    Retrieves connection strings for all SQL Endpoints in the workspace using pipeline input.

.NOTES
    - Requires `$FabricAuthContext` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricSQLEndpointConnectionString {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SQLEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GuestTenantId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('None', 'Workspace')]
        [string]$PrivateLinkType
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Build query parameters hashtable
        $queryParams = @{}
        if ($GuestTenantId) {
            $queryParams['guestTenantId'] = $GuestTenantId
        }
        if ($PrivateLinkType) {
            $queryParams['privateLinkType'] = $PrivateLinkType
        }

        # Construct the API endpoint URI using New-FabricAPIUri
        $uriParams = @{
            Resource    = 'workspaces'
            WorkspaceId = $WorkspaceId
            Subresource = 'sqlEndpoints'
            ItemId      = "$SQLEndpointId/connectionString"
        }
        if ($queryParams.Count -gt 0) {
            $uriParams['QueryParameters'] = $queryParams
        }
        $apiEndpointURI = New-FabricAPIUri @uriParams

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Handle response
        if (-not $response) {
            Write-FabricLog -Message "No connection string returned from the API." -Level Warning
            return $null
        }

        Write-FabricLog -Message "Connection string retrieved successfully." -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SQL Endpoint connection string. Error: $errorDetails" -Level Error
    }
}
