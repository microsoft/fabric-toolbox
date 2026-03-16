<#
.SYNOPSIS
    Creates a new Operations Agent item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Operations Agent item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Operations Agent item will be created. Mandatory.

.PARAMETER OperationsAgentName
    The name of the Operations Agent item to be created. Mandatory.

.PARAMETER OperationsAgentDescription
    Optional description for the Operations Agent item.

.PARAMETER OperationsAgentPathDefinition
    Optional file path to the Operations Agent item definition JSON file.

.PARAMETER OperationsAgentPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricOperationsAgent -WorkspaceId "workspace-12345" -OperationsAgentName "New Operations Agent" -OperationsAgentDescription "Description of the new Operations Agent item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricOperationsAgent {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$OperationsAgentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'OperationsAgents'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $OperationsAgentName
        }

        if ($OperationsAgentDescription) {
            $body.description = $OperationsAgentDescription
        }

        # Add Operations Agent item definition file content if provided
        if ($OperationsAgentPathDefinition) {
            $OperationsAgentEncodedContent = Convert-ToBase64 -filePath $OperationsAgentPathDefinition

            if (-not [string]::IsNullOrEmpty($OperationsAgentEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $OperationsAgentEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Operations Agent definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($OperationsAgentPathPlatformDefinition) {
            $OperationsAgentEncodedPlatformContent = Convert-ToBase64 -filePath $OperationsAgentPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($OperationsAgentEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $OperationsAgentEncodedPlatformContent
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
        $action = "Create Operations Agent '$OperationsAgentName'"
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
            Write-FabricLog -Message "Operations Agent '$OperationsAgentName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Operations Agent. Error: $errorDetails" -Level Error
    }
}

