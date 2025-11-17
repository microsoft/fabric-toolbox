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
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/startMirroring" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseId, "Start mirroring for mirrored database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-Message -Message "Database mirroring started successfully for Mirrored DatabaseId: $MirroredDatabaseId" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to start MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
