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
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EnvironmentName
        }

        if ($EnvironmentDescription) {
            $body.description = $EnvironmentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Update Fabric environment '$EnvironmentName' in workspace '$WorkspaceId'")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment '$EnvironmentName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Environment. Error: $errorDetails" -Level Error
    }
}
