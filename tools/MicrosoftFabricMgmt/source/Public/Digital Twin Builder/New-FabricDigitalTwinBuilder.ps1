<#
.SYNOPSIS
    Creates a new Digital Twin Builder item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Digital Twin Builder item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Digital Twin Builder item will be created. Mandatory.

.PARAMETER DigitalTwinBuilderName
    The name of the Digital Twin Builder item to be created. Mandatory.

.PARAMETER DigitalTwinBuilderDescription
    Optional description for the Digital Twin Builder item.

.PARAMETER DigitalTwinBuilderPathDefinition
    Optional file path to the Digital Twin Builder item definition JSON file.

.PARAMETER DigitalTwinBuilderPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricDigitalTwinBuilder -WorkspaceId "workspace-12345" -DigitalTwinBuilderName "New Digital Twin Builder" -DigitalTwinBuilderDescription "Description of the new Digital Twin Builder item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricDigitalTwinBuilder {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DigitalTwinBuilderName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'digitaltwinbuilders'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DigitalTwinBuilderName
        }

        if ($DigitalTwinBuilderDescription) {
            $body.description = $DigitalTwinBuilderDescription
        }

        # Add Digital Twin Builder item definition file content if provided
        if ($DigitalTwinBuilderPathDefinition) {
            $DigitalTwinBuilderEncodedContent = Convert-ToBase64 -filePath $DigitalTwinBuilderPathDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $DigitalTwinBuilderEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Digital Twin Builder definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($DigitalTwinBuilderPathPlatformDefinition) {
            $DigitalTwinBuilderEncodedPlatformContent = Convert-ToBase64 -filePath $DigitalTwinBuilderPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $DigitalTwinBuilderEncodedPlatformContent
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
        $action = "Create Digital Twin Builder '$DigitalTwinBuilderName'"
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
            Write-FabricLog -Message "Digital Twin Builder '$DigitalTwinBuilderName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Digital Twin Builder. Error: $errorDetails" -Level Error
    }
}

