<#
.SYNOPSIS
Updates the properties of a Fabric workspace.

.DESCRIPTION
The `Update-FabricWorkspace` function updates the name and/or description of a specified Fabric workspace by making a PATCH request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be updated.

.PARAMETER WorkspaceName
The new name for the workspace.

.PARAMETER WorkspaceDescription
(Optional) The new description for the workspace.

.EXAMPLE
Update-FabricWorkspace -WorkspaceId "workspace123" -WorkspaceName "NewWorkspaceName"

Updates the name of the workspace with the ID "workspace123" to "NewWorkspaceName".

.EXAMPLE
Update-FabricWorkspace -WorkspaceId "workspace123" -WorkspaceName "NewName" -WorkspaceDescription "Updated description"

Updates both the name and description of the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Update-FabricWorkspace {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]

        [string]$WorkspaceName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceDescription
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId

        # Construct the request body
        $body = @{
            displayName = $WorkspaceName
        }

        if ($WorkspaceDescription) {
            $body.description = $WorkspaceDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId' to '$WorkspaceName'", 'Update')) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Workspace '$WorkspaceName' updated successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update workspace. Error: $errorDetails" -Level Error
    }
}
