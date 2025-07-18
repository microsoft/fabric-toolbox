<#
.SYNOPSIS
Updates the definition of a MirroredDatabase in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a MirroredDatabase in a Microsoft Fabric workspace. 
The MirroredDatabase content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the MirroredDatabase resides.

.PARAMETER MirroredDatabaseId
(Mandatory) The unique identifier of the MirroredDatabase to be updated.

.PARAMETER MirroredDatabasePathDefinition
(Mandatory) The file path to the MirroredDatabase content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER MirroredDatabasePathPlatformDefinition
(Optional) The file path to the MirroredDatabase's platform-specific definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER UpdateMetadata
(Optional)A boolean flag indicating whether to update the MirroredDatabase's metadata. 
Default: `$false`.

.EXAMPLE
Update-FabricMirroredDatabaseDefinition -WorkspaceId "12345" -MirroredDatabaseId "67890" -MirroredDatabasePathDefinition "C:\MirroredDatabases\MirroredDatabase.json"

Updates the content of the MirroredDatabase with ID `67890` in the workspace `12345` using the specified MirroredDatabase file.

.EXAMPLE
Update-FabricMirroredDatabaseDefinition -WorkspaceId "12345" -MirroredDatabaseId "67890" -MirroredDatabasePathDefinition "C:\MirroredDatabases\MirroredDatabase.json" -UpdateMetadata $true

Updates both the content and metadata of the MirroredDatabase with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The MirroredDatabase content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch  

#>
function Update-FabricMirroredDatabaseDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic  
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        if ($MirroredDatabasePathPlatformDefinition) {
            $apiEndpointURI = "?updateMetadata=true" -f $apiEndpointURI 
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            } 
        }
      
        if ($MirroredDatabasePathDefinition) {
            $MirroredDatabaseEncodedContent = Convert-ToBase64 -filePath $MirroredDatabasePathDefinition
            
            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "MirroredDatabase.json"
                    payload     = $MirroredDatabaseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in MirroredDatabase definition." -Level Error
                return $null
            }
        }

        if ($MirroredDatabasePathPlatformDefinition) {
            $MirroredDatabaseEncodedPlatformContent = Convert-ToBase64 -filePath $MirroredDatabasePathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MirroredDatabaseEncodedPlatformContent
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
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        
        Write-Message -Message "Successfully updated the definition for Mirrored Database with ID '$MirroredDatabaseId' in workspace '$WorkspaceId'." -Level Info
        return $response   
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
