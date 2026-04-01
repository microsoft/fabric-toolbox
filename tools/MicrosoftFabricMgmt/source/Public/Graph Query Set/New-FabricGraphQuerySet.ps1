<#
.SYNOPSIS
    Creates a new Graph Query Set item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new Graph Query Set item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Graph Query Set item will be created. Mandatory.

.PARAMETER GraphQuerySetName
    The name of the Graph Query Set item to be created. Mandatory.

.PARAMETER GraphQuerySetDescription
    Optional description for the Graph Query Set item.

.PARAMETER GraphQuerySetPathDefinition
    Optional file path to the Graph Query Set item definition JSON file.

.PARAMETER GraphQuerySetPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricGraphQuerySet -WorkspaceId "workspace-12345" -GraphQuerySetName "New Graph Query Set" -GraphQuerySetDescription "Description of the new Graph Query Set item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricGraphQuerySet {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQuerySetName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQuerySetDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQuerySetPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQuerySetPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQuerySets'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $GraphQuerySetName
        }

        if ($GraphQuerySetDescription) {
            $body.description = $GraphQuerySetDescription
        }

        # Add Graph Query Set item definition file content if provided
        if ($GraphQuerySetPathDefinition) {
            $GraphQuerySetEncodedContent = Convert-ToBase64 -filePath $GraphQuerySetPathDefinition

            if (-not [string]::IsNullOrEmpty($GraphQuerySetEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $GraphQuerySetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Graph Query Set definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($GraphQuerySetPathPlatformDefinition) {
            $GraphQuerySetEncodedPlatformContent = Convert-ToBase64 -filePath $GraphQuerySetPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($GraphQuerySetEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $GraphQuerySetEncodedPlatformContent
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
        $action = "Create Graph Query Set '$GraphQuerySetName'"
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
            Write-FabricLog -Message "Graph Query Set '$GraphQuerySetName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Graph Query Set. Error: $errorDetails" -Level Error
    }
}

