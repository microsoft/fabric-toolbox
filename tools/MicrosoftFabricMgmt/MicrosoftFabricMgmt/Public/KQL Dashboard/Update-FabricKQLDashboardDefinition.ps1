<#
.SYNOPSIS
Updates the definition of a KQLDashboard in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a KQLDashboard in a Microsoft Fabric workspace. 
The KQLDashboard content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the KQLDashboard resides.

.PARAMETER KQLDashboardId
(Mandatory) The unique identifier of the KQLDashboard to be updated.

.PARAMETER KQLDashboardPathDefinition
(Mandatory) The file path to the KQLDashboard content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER KQLDashboardPathPlatformDefinition
(Optional) The file path to the KQLDashboard's platform-specific definition file. The content will be encoded as Base64 and sent in the request.


.EXAMPLE
Update-FabricKQLDashboardDefinition -WorkspaceId "12345" -KQLDashboardId "67890" -KQLDashboardPathDefinition "C:\KQLDashboards\KQLDashboard.ipynb"

Updates the content of the KQLDashboard with ID `67890` in the workspace `12345` using the specified KQLDashboard file.

.EXAMPLE
Update-FabricKQLDashboardDefinition -WorkspaceId "12345" -KQLDashboardId "67890" -KQLDashboardPathDefinition "C:\KQLDashboards\KQLDashboard.ipynb" 

Updates both the content and metadata of the KQLDashboard with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The KQLDashboard content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch  

#>
function Update-FabricKQLDashboardDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic  
        $apiEndpointURI = "{0}/workspaces/{1}/KQLDashboards/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        if ($KQLDashboardPathPlatformDefinition) {
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
      
        if ($KQLDashboardPathDefinition) {
            $KQLDashboardEncodedContent = Convert-ToBase64 -filePath $KQLDashboardPathDefinition
            
            if (-not [string]::IsNullOrEmpty($KQLDashboardEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "RealTimeDashboard.json"
                    payload     = $KQLDashboardEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in KQLDashboard definition." -Level Error
                return $null
            }
        }

        if ($KQLDashboardPathPlatformDefinition) {
            $KQLDashboardEncodedPlatformContent = Convert-ToBase64 -filePath $KQLDashboardPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($KQLDashboardEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLDashboardEncodedPlatformContent
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
        Write-Message -Message "Successfully updated the definition for KQL Dashboard with ID '$KQLDashboardId' in workspace '$WorkspaceId'." -Level Info        
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update KQLDashboard. Error: $errorDetails" -Level Error
    }
}
