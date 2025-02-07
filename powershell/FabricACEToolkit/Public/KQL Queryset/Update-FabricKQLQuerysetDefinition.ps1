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
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/kqlQuerysets/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId

        if($KQLQuerysetPathPlatformDefinition){
            $apiEndpointUrl = "?updateMetadata=true" -f $apiEndpointUrl 
        }
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
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
                Write-Message -Message "Update definition for KQLQueryset '$KQLQuerysetId' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Update definition for KQLQueryset '$KQLQuerysetId' accepted. Operation in progress!" -Level Info
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                $operationResult = Get-FabricLongRunningOperation -operationId $operationId

                # Handle operation result
                if ($operationResult.status -eq "Succeeded") {
                    Write-Message -Message "Operation Succeeded" -Level Debug
                    
                    $result = Get-FabricLongRunningOperationResult -operationId $operationId
                    return $result.definition.parts
                }
                else {
                    Write-Message -Message "Operation Failed" -Level Debug
                    return $operationResult.definition.parts
                }   
            } 
            default {
                Write-Message -Message "Unexpected response code: $statusCode" -Level Error
                Write-Message -Message "Error details: $($response.message)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update KQLQueryset. Error: $errorDetails" -Level Error
    }
}
