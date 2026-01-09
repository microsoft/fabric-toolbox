<#
.SYNOPSIS
    Updates the definition of an existing Eventhouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Eventhouse
    in the specified workspace. It supports optional parameters for Eventhouse definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is mandatory.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to be updated. This parameter is mandatory.

.PARAMETER EventhousePathDefinition
    An optional path to the Eventhouse definition file to upload.

.PARAMETER EventhousePathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
     Update-FabricEventhouseDefinition -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890" -EventhousePathDefinition "C:\Path\To\EventhouseDefinition.json"
    This example updates the definition of the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricEventhouseDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathPlatformDefinition
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI with filtering logic
        $queryParams = if ($EventhousePathPlatformDefinition) { @{ updateMetadata = 'true' } } else { $null }
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "eventhouses/$EventhouseId/updateDefinition" -QueryParameters $queryParams

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($EventhousePathDefinition) {
            $EventhouseEncodedContent = Convert-ToBase64 -filePath $EventhousePathDefinition

            if (-not [string]::IsNullOrEmpty($EventhouseEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "EventhouseProperties.json"
                    payload     = $EventhouseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Eventhouse definition." -Level Error
                return
            }
        }

        if ($EventhousePathPlatformDefinition) {
            $EventhouseEncodedPlatformContent = Convert-ToBase64 -filePath $EventhousePathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($EventhouseEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventhouseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body -Depth 10

        if ($PSCmdlet.ShouldProcess($EventhouseId, "Update Eventhouse definition in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Eventhouse with ID '$EventhouseId' in workspace '$WorkspaceId'." -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Eventhouse definition. Error: $errorDetails" -Level Error
    }
}
