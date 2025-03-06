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
        [string]$NotebookPathPlatformDefinition
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/notebooks/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId

        if ($NotebookPathPlatformDefinition) {
            $apiEndpointUrl += "?updateMetadata=true" -f $apiEndpointUrl 
        }
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                format = "ipynb"
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

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Post `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"
       
        # Step 5: Handle and log the response
        switch ($statusCode) {
            200 {
                Write-Message -Message "Update definition for notebook '$NotebookId' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Update definition for notebook '$NotebookId' accepted. Operation in progress!" -Level Info
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                [string]$retryAfter = $responseHeader["Retry-After"]

                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Location: '$location'" -Level Debug
                Write-Message -Message "Retry-After: '$retryAfter'" -Level Debug
                Write-Message -Message "Getting Long Running Operation status" -Level Debug

                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location
                Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug
                # Handle operation result
                if ($operationStatus.status -eq "Succeeded") {
                    Write-Message -Message "Operation Succeeded" -Level Debug
                    Write-Message -Message "Getting Long Running Operation result" -Level Debug
                
                    $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                    Write-Message -Message "Long Running Operation status: $operationResult" -Level Debug
                
                    return $operationResult
                } 
                else {
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Debug
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Error
                    return $operationStatus
                }  
            } 
            default {
                Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-Message -Message "Error: $($response.message)" -Level Error
                Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-Message "Error Code: $($response.errorCode)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update notebook. Error: $errorDetails" -Level Error
    }
}
