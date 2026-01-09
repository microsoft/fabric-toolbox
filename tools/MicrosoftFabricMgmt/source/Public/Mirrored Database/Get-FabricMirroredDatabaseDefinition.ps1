
<#
.SYNOPSIS
Retrieves the definition of a MirroredDatabase from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the MirroredDatabase's content or metadata from a workspace.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the MirroredDatabase definition is to be retrieved.

.PARAMETER MirroredDatabaseId
(Optional)The unique identifier of the MirroredDatabase whose definition needs to be retrieved.

.EXAMPLE
Get-FabricMirroredDatabaseDefinition -WorkspaceId "12345" -MirroredDatabaseId "67890"

Retrieves the definition of the MirroredDatabase with ID `67890` from the workspace with ID `12345`.

.EXAMPLE
Get-FabricMirroredDatabaseDefinition -WorkspaceId "12345"

Retrieves the definitions of all MirroredDatabases in the workspace with ID `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricMirroredDatabaseDefinition {
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
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/getDefinition" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
