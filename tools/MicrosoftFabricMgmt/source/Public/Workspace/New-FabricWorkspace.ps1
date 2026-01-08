<#
.SYNOPSIS
Creates a new Fabric workspace.

.DESCRIPTION
The New-FabricWorkspace cmdlet creates a Microsoft Fabric workspace by issuing a POST request to the Fabric API.
You must provide a valid display name. Optionally, include a description to aid discoverability and a capacity Id to
assign the workspace immediately to a capacity. The command supports ShouldProcess for safer automation (use -WhatIf).

.PARAMETER WorkspaceName
The display name of the workspace to create. Allowed characters are letters, numbers, spaces, and underscores. Choose
a name that clearly reflects the workspace purpose (e.g. Finance Analytics) for easier administration.

.PARAMETER WorkspaceDescription
Optional textual description explaining the workspace’s intended usage, stakeholders, or data domain. Providing a
meaningful description helps other administrators and users understand scope without opening items.

.PARAMETER CapacityId
Optional GUID of the capacity to assign the workspace to at creation time. If omitted, the workspace might be created
in a default capacity or remain unassigned depending on tenant settings. Ensure you have rights to use the capacity.

.EXAMPLE
New-FabricWorkspace -WorkspaceName "Finance Analytics" -WorkspaceDescription "Finance planning & reporting models" -CapacityId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Creates a workspace with a descriptive purpose and assigns it to a specified capacity.

.EXAMPLE
New-FabricWorkspace -WorkspaceName "DataLab" -WhatIf

Shows what would happen without actually creating the workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.
- Supports ShouldProcess for confirmation and -WhatIf/-Confirm behavior.

Author: Tiago Balabuch
#>

function New-FabricWorkspace {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WorkspaceName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces'

        # Construct the request body
        $body = @{
            displayName = $WorkspaceName
        }

        if ($WorkspaceDescription) {
            $body.description = $WorkspaceDescription
        }

        if ($CapacityId) {
            $body.capacityId = $CapacityId
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceName'", 'Create')) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Workspace '$WorkspaceName' created successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create workspace. Error: $errorDetails" -Level Error

    }
}
