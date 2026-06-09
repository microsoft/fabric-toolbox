<#
.SYNOPSIS
    Creates a new Event Schema Set item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Event Schema Set item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Event Schema Set item will be created. Mandatory.

.PARAMETER EventSchemaSetName
    The name of the Event Schema Set item to be created. Mandatory.

.PARAMETER EventSchemaSetDescription
    Optional description for the Event Schema Set item.

.PARAMETER EventSchemaSetPathDefinition
    Optional file path to the Event Schema Set item definition JSON file.

.PARAMETER EventSchemaSetPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricEventSchemaSet -WorkspaceId "workspace-12345" -EventSchemaSetName "New Event Schema Set" -EventSchemaSetDescription "Description of the new Event Schema Set item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricEventSchemaSet {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventSchemaSetName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventSchemaSetDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventSchemaSetPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventSchemaSetPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventSchemaSets'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EventSchemaSetName
        }

        if ($EventSchemaSetDescription) {
            $body.description = $EventSchemaSetDescription
        }

        # Add Event Schema Set item definition file content if provided
        if ($EventSchemaSetPathDefinition) {
            $EventSchemaSetEncodedContent = Convert-ToBase64 -filePath $EventSchemaSetPathDefinition

            if (-not [string]::IsNullOrEmpty($EventSchemaSetEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $EventSchemaSetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Event Schema Set definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($EventSchemaSetPathPlatformDefinition) {
            $EventSchemaSetEncodedPlatformContent = Convert-ToBase64 -filePath $EventSchemaSetPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($EventSchemaSetEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventSchemaSetEncodedPlatformContent
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
        $action = "Create Event Schema Set '$EventSchemaSetName'"
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
            Write-FabricLog -Message "Event Schema Set '$EventSchemaSetName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Event Schema Set. Error: $errorDetails" -Level Error
    }
}

