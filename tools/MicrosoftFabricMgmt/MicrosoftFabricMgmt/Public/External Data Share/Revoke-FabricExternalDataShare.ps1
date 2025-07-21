<#
.SYNOPSIS
    Revokes an external data share from a specified Microsoft Fabric workspace item.

.DESCRIPTION
    This function revokes an external data share by calling the Microsoft Fabric API.
    It validates the authentication token, constructs the appropriate API endpoint, and sends a revoke request.
    The function requires workspace, item, and external data share IDs.

.PARAMETER WorkspaceId
    The ID of the Microsoft Fabric workspace containing the item.

.PARAMETER ItemId
    The ID of the item within the workspace.

.PARAMETER ExternalDataShareId
    The ID of the external data share to revoke.

.EXAMPLE
    Revoke-FabricExternalDataShare -WorkspaceId "abc123" -ItemId "def456" -ExternalDataShareId "ghi789"
    Revokes the specified external data share from the given workspace item.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Author: Tiago Balabuch
#>
function Revoke-FabricExternalDataShare {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ExternalDataShareId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI  
        Write-Message -Message "Constructing API endpoint URI..." -Level Debug
        $apiEndpointURI = "{0}/admin/workspaces/{1}/items/{2}/externalDataShares/{3}/revoke" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId, $ExternalDataShareId
                
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "External data share with ID '$ExternalDataShareId' successfully revoked in workspace '$WorkspaceId', item '$ItemId'." -Level Info
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve External Data Shares. Error: $errorDetails" -Level Error
    } 
 
}
