<#
.SYNOPSIS

Retrieves the mirroring status of a MirroredDatabase from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the MirroredDatabase mirroring status from a workspace and handles authentication and API requests.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricMirroredDatabaseStatus {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/getMirroringStatus" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Mirrored Database '$MirroredDatabaseId' status retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
