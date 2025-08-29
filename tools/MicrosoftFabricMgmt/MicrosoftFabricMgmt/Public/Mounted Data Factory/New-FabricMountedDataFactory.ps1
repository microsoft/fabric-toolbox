<#
.SYNOPSIS
    Creates a new Mounted Data Factory resource in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Provisions a new Mounted Data Factory in the given workspace by sending a POST request to the Microsoft Fabric API.
    Allows optional parameters for description, definition file, platform-specific definition file, and folder placement.

.PARAMETER WorkspaceId
    The ID of the workspace where the Mounted Data Factory will be created. Required.

.PARAMETER MountedDataFactoryName
    The display name for the new Mounted Data Factory. Required.

.PARAMETER MountedDataFactoryDescription
    Optional. A description for the Mounted Data Factory.

.PARAMETER MountedDataFactoryPathDefinition
    Optional. Path to the Mounted Data Factory definition file.

.PARAMETER MountedDataFactoryPathPlatformDefinition
    Optional. Path to the platform-specific definition file.

.PARAMETER FolderId
    Optional. The folder ID where the Mounted Data Factory will be placed.

.EXAMPLE
    New-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryName "MyFactory" -MountedDataFactoryDescription "Sample factory"
    Creates a new Mounted Data Factory named "MyFactory" in the specified workspace with a description.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function New-FabricMountedDataFactory {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MountedDataFactoryName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MountedDataFactoryName
        }

        if ($FolderId) {
            $body.folderId = $FolderId
        }

        if ($MountedDataFactoryDescription) {
            $body.description = $MountedDataFactoryDescription
        }
        if ($MountedDataFactoryPathDefinition) {
            $MountedDataFactoryEncodedContent = Convert-ToBase64 -filePath $MountedDataFactoryPathDefinition

            if (-not [string]::IsNullOrEmpty($MountedDataFactoryEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "MountedDataFactoryV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "mountedDataFactory-content.json"
                    payload     = $MountedDataFactoryEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in MountedDataFactory definition." -Level Error
                return $null
            }
        }

        if ($MountedDataFactoryPathPlatformDefinition) {
            $MountedDataFactoryEncodedPlatformContent = Convert-ToBase64 -filePath $MountedDataFactoryPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($MountedDataFactoryEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "MountedDataFactoryV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MountedDataFactoryEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Mounted Data Factory '$MountedDataFactoryName' created successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}