<#
.SYNOPSIS
Updates the definition of a Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a Eventstream in a Microsoft Fabric workspace.
The Eventstream content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the Eventstream resides.

.PARAMETER EventstreamId
(Mandatory) The unique identifier of the Eventstream to be updated.

.PARAMETER EventstreamPathDefinition
(Mandatory) The file path to the Eventstream content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER EventstreamPathPlatformDefinition
(Optional) The file path to the Eventstream's platform-specific definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER UpdateMetadata
(Optional)A boolean flag indicating whether to update the Eventstream's metadata.
Default: `$false`.

.EXAMPLE
Update-FabricEventstreamDefinition -WorkspaceId "12345" -EventstreamId "67890" -EventstreamPathDefinition "C:\Eventstreams\Eventstream.ipynb"

Updates the content of the Eventstream with ID `67890` in the workspace `12345` using the specified Eventstream file.

.EXAMPLE
Update-FabricEventstreamDefinition -WorkspaceId "12345" -EventstreamId "67890" -EventstreamPathDefinition "C:\Eventstreams\Eventstream.ipynb" -UpdateMetadata $true

Updates both the content and metadata of the Eventstream with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The Eventstream content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>
function Update-FabricEventstreamDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathPlatformDefinition
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI with optional updateMetadata query parameter
        $queryParams = if ($EventstreamPathPlatformDefinition) {
            @{ updateMetadata = 'true' }
        } else {
            $null
        }

        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId -QueryParameters $queryParams
        $apiEndpointURI = $apiEndpointURI -replace '/eventstreams/([^/?]+)', '/eventstreams/$1/updateDefinition'

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($EventstreamPathDefinition) {
            $EventstreamEncodedContent = Convert-ToBase64 -filePath $EventstreamPathDefinition

            if (-not [string]::IsNullOrEmpty($EventstreamEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "eventstream.json"
                    payload     = $EventstreamEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Eventstream definition." -Level Error
                return
            }
        }

        if ($EventstreamPathPlatformDefinition) {
            $EventstreamEncodedPlatformContent = Convert-ToBase64 -filePath $EventstreamPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($EventstreamEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventstreamEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Update Eventstream definition in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Eventstream with ID '$EventstreamId' in workspace '$WorkspaceId'." -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Eventstream. Error: $errorDetails" -Level Error
    }
}
