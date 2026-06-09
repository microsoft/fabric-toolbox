<#
.SYNOPSIS
    Creates a new Digital Twin Builder Flow item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Digital Twin Builder Flow item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Digital Twin Builder Flow item will be created. Mandatory.

.PARAMETER DigitalTwinBuilderFlowName
    The name of the Digital Twin Builder Flow item to be created. Mandatory.

.PARAMETER DigitalTwinBuilderFlowDescription
    Optional description for the Digital Twin Builder Flow item.

.PARAMETER DigitalTwinBuilderFlowPathDefinition
    Optional file path to the Digital Twin Builder Flow item definition JSON file.

.PARAMETER DigitalTwinBuilderFlowPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricDigitalTwinBuilderFlow -WorkspaceId "workspace-12345" -DigitalTwinBuilderFlowName "New Digital Twin Builder Flow" -DigitalTwinBuilderFlowDescription "Description of the new Digital Twin Builder Flow item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricDigitalTwinBuilderFlow {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DigitalTwinBuilderFlowName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'DigitalTwinBuilderFlows'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DigitalTwinBuilderFlowName
        }

        if ($DigitalTwinBuilderFlowDescription) {
            $body.description = $DigitalTwinBuilderFlowDescription
        }

        # Add Digital Twin Builder Flow item definition file content if provided
        if ($DigitalTwinBuilderFlowPathDefinition) {
            $DigitalTwinBuilderFlowEncodedContent = Convert-ToBase64 -filePath $DigitalTwinBuilderFlowPathDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderFlowEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $DigitalTwinBuilderFlowEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Digital Twin Builder Flow definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($DigitalTwinBuilderFlowPathPlatformDefinition) {
            $DigitalTwinBuilderFlowEncodedPlatformContent = Convert-ToBase64 -filePath $DigitalTwinBuilderFlowPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($DigitalTwinBuilderFlowEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $DigitalTwinBuilderFlowEncodedPlatformContent
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
        $action = "Create Digital Twin Builder Flow '$DigitalTwinBuilderFlowName'"
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
            Write-FabricLog -Message "Digital Twin Builder Flow '$DigitalTwinBuilderFlowName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Digital Twin Builder Flow. Error: $errorDetails" -Level Error
    }
}

