<#
.SYNOPSIS
Updates the definition of a KQLQueryset in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a KQLQueryset in a Microsoft Fabric workspace. 
The KQLQueryset content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the KQLQueryset resides.

.PARAMETER KQLQuerysetId
(Mandatory) The unique identifier of the KQLQueryset to be updated.

.PARAMETER KQLQuerysetPathDefinition
(Mandatory) The file path to the KQLQueryset content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER KQLQuerysetPathPlatformDefinition
(Optional) The file path to the KQLQueryset's platform-specific definition file. The content will be encoded as Base64 and sent in the request.


.EXAMPLE
Update-FabricKQLQuerysetDefinition -WorkspaceId "12345" -KQLQuerysetId "67890" -KQLQuerysetPathDefinition "C:\KQLQuerysets\KQLQueryset.ipynb"

Updates the content of the KQLQueryset with ID `67890` in the workspace `12345` using the specified KQLQueryset file.

.EXAMPLE
Update-FabricKQLQuerysetDefinition -WorkspaceId "12345" -KQLQuerysetId "67890" -KQLQuerysetPathDefinition "C:\KQLQuerysets\KQLQueryset.ipynb" 

Updates both the content and metadata of the KQLQueryset with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The KQLQueryset content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch  

#>
function Update-FabricKQLQuerysetDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic  
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId
        if ($KQLQuerysetPathPlatformDefinition) {
            $apiEndpointURI = "?updateMetadata=true" -f $apiEndpointURI 
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                format = $null
                parts  = @()
            } 
        }
      
        if ($KQLQuerysetPathDefinition) {
            $KQLQuerysetEncodedContent = Convert-ToBase64 -filePath $KQLQuerysetPathDefinition
            
            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "RealTimeQueryset.json"
                    payload     = $KQLQuerysetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in KQLQueryset definition." -Level Error
                return $null
            }
        }

        if ($KQLQuerysetPathPlatformDefinition) {
            $KQLQuerysetEncodedPlatformContent = Convert-ToBase64 -filePath $KQLQuerysetPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLQuerysetEncodedPlatformContent
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
        Write-Message -Message "Successfully updated the definition for KQL Queryset with ID '$KQLQuerysetId' in workspace '$WorkspaceId'." -Level Info        
        return $response         
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update KQLQueryset. Error: $errorDetails" -Level Error
    }
}
