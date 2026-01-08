<#
.SYNOPSIS
Retrieves details of a Microsoft Fabric workspace by its ID or name.

.DESCRIPTION
The `Get-FabricWorkspace` function fetches workspace details from the Fabric API. It supports filtering by WorkspaceId or WorkspaceName.

.PARAMETER WorkspaceId
The unique identifier of the workspace to retrieve.

.PARAMETER WorkspaceName
The display name of the workspace to retrieve.

.EXAMPLE
Get-FabricWorkspace -WorkspaceId "workspace123"

Fetches details of the workspace with ID "workspace123".

.EXAMPLE
Get-FabricWorkspace -WorkspaceName "MyWorkspace"

Fetches details of the workspace with the name "MyWorkspace".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Returns the matching workspace details or all workspaces if no filter is provided.

Author: Tiago Balabuch
#>

function Get-FabricWorkspace {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WorkspaceName
    )

    try {
        # Validate input parameters
        if ($WorkspaceId -and $WorkspaceName) {
            Write-FabricLog -Message "Specify only one parameter: either 'WorkspaceId' or 'WorkspaceName'." -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering and output results
        Select-FabricResource -InputObject $dataItems -Id $WorkspaceId -DisplayName $WorkspaceName -ResourceType 'Workspace'
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve workspace. Error: $errorDetails" -Level Error
    }
}
