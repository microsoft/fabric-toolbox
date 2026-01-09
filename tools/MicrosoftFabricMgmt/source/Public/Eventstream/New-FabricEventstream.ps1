<#
.SYNOPSIS
Creates a new Eventstream in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new Eventstream
in the specified workspace. It supports optional parameters for Eventstream description
and path definitions for the Eventstream content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the Eventstream will be created.

.PARAMETER EventstreamName
The name of the Eventstream to be created.

.PARAMETER EventstreamDescription
An optional description for the Eventstream.

.PARAMETER EventstreamPathDefinition
An optional path to the Eventstream definition file (e.g., .ipynb file) to upload.

.PARAMETER EventstreamPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricEventstream -WorkspaceId "workspace-12345" -EventstreamName "New Eventstream" -EventstreamPathDefinition "C:\Eventstreams\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathPlatformDefinition
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams'

        # Construct the request body
        $body = @{
            displayName = $EventstreamName
        }

        if ($EventstreamDescription) {
            $body.description = $EventstreamDescription
        }

        if ($EventstreamPathDefinition) {
            $EventstreamEncodedContent = Convert-ToBase64 -filePath $EventstreamPathDefinition

            if (-not [string]::IsNullOrEmpty($EventstreamEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "eventstream"
                        parts  = @()
                    }
                }

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
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "eventstream"
                        parts  = @()
                    }
                }

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

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EventstreamName, "Create Eventstream in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamName' created successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Eventstream. Error: $errorDetails" -Level Error
    }
}
