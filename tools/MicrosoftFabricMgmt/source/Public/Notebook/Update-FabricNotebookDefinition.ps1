<#
.SYNOPSIS
Updates the definition of a notebook in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a notebook in a Microsoft Fabric workspace. 
The notebook content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the notebook resides.

.PARAMETER NotebookId
(Mandatory) The unique identifier of the notebook to be updated.

.PARAMETER NotebookPathDefinition
(Mandatory) The file path to the notebook content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER NotebookPathPlatformDefinition
(Optional) The file path to the notebook's platform-specific definition file. The content will be encoded as Base64 and sent in the request.

.EXAMPLE
Update-FabricNotebookDefinition -WorkspaceId "12345" -NotebookId "67890" -NotebookPathDefinition "C:\Notebooks\Notebook.ipynb"

Updates the content of the notebook with ID `67890` in the workspace `12345` using the specified notebook file.

.EXAMPLE
Update-FabricNotebookDefinition -WorkspaceId "12345" -NotebookId "67890" -NotebookPathDefinition "C:\Notebooks\Notebook.ipynb" -NotebookPathPlatformDefinition "C:\Notebooks\.platform"

Updates both the content and metadata of the notebook with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The notebook content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch  

#>
function Update-FabricNotebookDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('ipynb', 'fabricGitSource')]
        [string]$NotebookFormat = 'ipynb'
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic  
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
        if ($NotebookPathPlatformDefinition) {
            $apiEndpointURI += "?updateMetadata=true" -f $apiEndpointURI 
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                format = $NotebookFormat
                parts  = @()
            } 
        }
      
        if ($NotebookPathDefinition) {
            $notebookEncodedContent = Convert-ToBase64 -filePath $NotebookPathDefinition
            
            if (-not [string]::IsNullOrEmpty($notebookEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "notebook-content.py"
                    payload     = $notebookEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in notebook definition." -Level Error
                return $null
            }
        }

        if ($NotebookPathPlatformDefinition) {
            $notebookEncodedPlatformContent = Convert-ToBase64 -filePath $NotebookPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($notebookEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $notebookEncodedPlatformContent
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
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
       
        # Return the API response
        Write-Message -Message "Successfully updated the definition for Notebook with ID '$NotebookId' in workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update notebook. Error: $errorDetails" -Level Error
    }
}
