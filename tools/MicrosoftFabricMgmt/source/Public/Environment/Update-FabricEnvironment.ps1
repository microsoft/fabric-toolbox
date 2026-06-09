<#
.SYNOPSIS
Updates the properties of a Fabric Environment.

.DESCRIPTION
The `Update-FabricEnvironment` function updates the name and/or description of a specified Fabric Environment by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Environment to update. Required to scope the API request.

.PARAMETER EnvironmentId
The unique identifier of the Environment to be updated.

.PARAMETER EnvironmentName
The new name for the Environment.

.PARAMETER EnvironmentDescription
(Optional) The new description for the Environment.

.EXAMPLE
Update-FabricEnvironment -EnvironmentId "Environment123" -EnvironmentName "NewEnvironmentName"

Updates the name of the Environment with the ID "Environment123" to "NewEnvironmentName".

.EXAMPLE
Update-FabricEnvironment -EnvironmentId "Environment123" -EnvironmentName "NewName" -EnvironmentDescription "Updated description"

Updates both the name and description of the Environment "Environment123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricEnvironment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$EnvironmentDescription
    )
    process {
    try {
        # Validate that at least one update parameter is provided
        if (-not $EnvironmentName -and -not $EnvironmentDescription) {
            Write-FabricLog -Message "At least one of EnvironmentName or EnvironmentDescription must be specified" -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'environments' -ItemId $EnvironmentId

        # Construct the request body
        $body = @{}

        if ($EnvironmentName) {
            $body.displayName = $EnvironmentName
        }

        if ($EnvironmentDescription) {
            $body.description = $EnvironmentDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Update Fabric environment '$EnvironmentName' in workspace '$WorkspaceId'")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment '$EnvironmentName' updated successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Environment. Error: $errorDetails" -Level Error
    }
    }
}
