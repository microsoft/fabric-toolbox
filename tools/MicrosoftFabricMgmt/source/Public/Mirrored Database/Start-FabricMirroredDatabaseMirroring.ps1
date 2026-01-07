<#
.SYNOPSIS
Starts mirroring for a specified MirroredDatabase in a workspace.

.DESCRIPTION
Initiates mirroring on the MirroredDatabase via the Fabric API with proper authentication and confirmation support.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Mirrored Database to start mirroring for. This value is required to scope the API request.

.PARAMETER MirroredDatabaseId
The identifier of the Mirrored Database to start mirroring. Provide the resource ID of the target mirrored database within the specified workspace.

.EXAMPLE
Start-FabricMirroredDatabaseMirroring -WorkspaceId "workspace123" -MirroredDatabase
Starts mirroring for the Mirrored Database with the ID "MirroredDatabase123" in the workspace "workspace123".
.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Start-FabricMirroredDatabaseMirroring {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/startMirroring" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseId, "Start mirroring for mirrored database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Database mirroring started successfully for Mirrored DatabaseId: $MirroredDatabaseId" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to start MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
