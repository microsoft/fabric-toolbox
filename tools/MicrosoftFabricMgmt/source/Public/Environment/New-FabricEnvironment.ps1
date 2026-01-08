<#
.SYNOPSIS
Creates a new environment in a specified workspace.

.DESCRIPTION
The `Add-FabricEnvironment` function creates a new environment within a given workspace by making a POST request to the Fabric API. The environment can optionally include a description.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace where the environment will be created.

.PARAMETER EnvironmentName
(Mandatory) The name of the environment to be created. Only alphanumeric characters, spaces, and underscores are allowed.

.PARAMETER EnvironmentDescription
(Optional) A description of the environment.

.EXAMPLE
Add-FabricEnvironment -WorkspaceId "12345" -EnvironmentName "DevEnv" -EnvironmentDescription "Development Environment"

Creates an environment named "DevEnv" in workspace "12345" with the specified description.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricEnvironment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentDescription
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'environments'

        # Construct the request body
        $body = @{
            displayName = $EnvironmentName
        }

        if ($EnvironmentDescription) {
            $body.description = $EnvironmentDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentName, "Create Fabric environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment '$EnvironmentName' created successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create environment. Error: $errorDetails" -Level Error
    }
}
