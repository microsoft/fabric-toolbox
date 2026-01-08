<#
.SYNOPSIS
    Creates a new Eventhouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Eventhouse
    in the specified workspace. It supports optional parameters for Eventhouse description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse will be created. This parameter is mandatory.

.PARAMETER EventhouseName
    The name of the Eventhouse to be created. This parameter is mandatory.

.PARAMETER EventhouseDescription
    An optional description for the Eventhouse.

.PARAMETER EventhousePathDefinition
    An optional path to the Eventhouse definition file to upload.

.PARAMETER EventhousePathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
     New-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseName "New Eventhouse" -EventhouseDescription "Description of the new Eventhouse"
    This example creates a new Eventhouse named "New Eventhouse" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricEventhouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventhouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathPlatformDefinition
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventhouses'

        # Construct the request body
        $body = @{
            displayName = $EventhouseName
        }

        if ($EventhouseDescription) {
            $body.description = $EventhouseDescription
        }
        if ($EventhousePathDefinition) {
            $eventhouseEncodedContent = Convert-ToBase64 -filePath $EventhousePathDefinition

            if (-not [string]::IsNullOrEmpty($eventhouseEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "EventhouseProperties.json"
                    payload     = $eventhouseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Eventhouse definition." -Level Error
                return
            }
        }

        if ($EventhousePathPlatformDefinition) {
            $eventhouseEncodedPlatformContent = Convert-ToBase64 -filePath $EventhousePathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($eventhouseEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $eventhouseEncodedPlatformContent
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

        if ($PSCmdlet.ShouldProcess($EventhouseName, "Create Eventhouse in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventhouse '$EventhouseName' created successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Eventhouse. Error: $errorDetails" -Level Error
    }
}
