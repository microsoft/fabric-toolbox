<#
.SYNOPSIS
    Updates the definition of a Mounted Data Factory in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends an update request to the Microsoft Fabric API to modify the definition of an existing Mounted Data Factory.
    Allows updating the main definition file and, optionally, a platform-specific definition file.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Mounted Data Factory.

.PARAMETER MountedDataFactoryId
    The unique identifier of the Mounted Data Factory to update.

.PARAMETER MountedDataFactoryPathDefinition
    File path to the main Mounted Data Factory definition (required).

.PARAMETER MountedDataFactoryPathPlatformDefinition
    Optional file path to a platform-specific definition.

.EXAMPLE
    Update-FabricMountedDataFactoryDefinition -WorkspaceId "workspace-12345" -MountedDataFactoryId "mdf-67890" -MountedDataFactoryPathDefinition "C:\Definitions\MDF.json"

.NOTES
    Requires a configured `$FabricConfig` object with `BaseUrl` and `FabricHeaders`.
    Authentication is validated using `Test-TokenExpired`.
    Author: Tiago Balabuch
#>
function Update-FabricMountedDataFactoryDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic     
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        if ($MountedDataFactoryPathPlatformDefinition) {
            $apiEndpointURI = "?updateMetadata=true" -f $apiEndpointURI 
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                format = "MountedDataFactoryV1"
                parts  = @()
            } 
        }
      
        if ($MountedDataFactoryPathDefinition) {
            $MountedDataFactoryEncodedContent = Convert-ToBase64 -filePath $MountedDataFactoryPathDefinition
            
            if (-not [string]::IsNullOrEmpty($MountedDataFactoryEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "MountedDataFactoryProperties.json"
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

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
       
        # Return the API response
        Write-Message -Message "Successfully updated the definition for Mounted Data Factory with ID '$MountedDataFactoryId' in workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}