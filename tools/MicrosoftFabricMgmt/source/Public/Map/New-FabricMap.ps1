<#
.SYNOPSIS
    Creates a new Map item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Map item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Map item will be created. Mandatory.

.PARAMETER MapName
    The name of the Map item to be created. Mandatory.

.PARAMETER MapDescription
    Optional description for the Map item.

.PARAMETER MapPathDefinition
    Optional file path to the Map item definition JSON file.

.PARAMETER MapPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricMap -WorkspaceId "workspace-12345" -MapName "New Map" -MapDescription "Description of the new Map item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricMap {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MapName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MapDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MapPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MapPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'Maps'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MapName
        }

        if ($MapDescription) {
            $body.description = $MapDescription
        }

        # Add Map item definition file content if provided
        if ($MapPathDefinition) {
            $MapEncodedContent = Convert-ToBase64 -filePath $MapPathDefinition

            if (-not [string]::IsNullOrEmpty($MapEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $MapEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Map definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($MapPathPlatformDefinition) {
            $MapEncodedPlatformContent = Convert-ToBase64 -filePath $MapPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($MapEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MapEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create Map '$MapName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Map '$MapName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Map. Error: $errorDetails" -Level Error
    }
}
