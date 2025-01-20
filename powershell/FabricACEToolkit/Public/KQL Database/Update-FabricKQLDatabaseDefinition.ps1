<#
.SYNOPSIS
Updates the definition of a KQLDatabase in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a KQLDatabase in a Microsoft Fabric workspace. 
The KQLDatabase content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the KQLDatabase resides.

.PARAMETER KQLDatabaseId
(Mandatory) The unique identifier of the KQLDatabase to be updated.

.PARAMETER KQLDatabasePathDefinition
(Mandatory) The file path to the KQLDatabase content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER KQLDatabasePathPlatformDefinition
(Optional) The file path to the KQLDatabase's platform-specific definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER UpdateMetadata
(Optional)A boolean flag indicating whether to update the KQLDatabase's metadata. 
Default: `$false`.

.EXAMPLE
Update-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890" -KQLDatabasePathDefinition "C:\KQLDatabases\KQLDatabase.ipynb"

Updates the content of the KQLDatabase with ID `67890` in the workspace `12345` using the specified KQLDatabase file.

.EXAMPLE
Update-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890" -KQLDatabasePathDefinition "C:\KQLDatabases\KQLDatabase.ipynb" -UpdateMetadata $true

Updates both the content and metadata of the KQLDatabase with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The KQLDatabase content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch  

#>

function Update-FabricKQLDatabaseDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathSchemaDefinition
    )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/kqlDatabases/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId

        if($KQLDatabasePathPlatformDefinition){
            $apiEndpointUrl = "?updateMetadata=true" -f $apiEndpointUrl 
        }
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts  = @()
            } 
        }
      
        if ($KQLDatabasePathDefinition) {
            $KQLDatabaseEncodedContent = Convert-ToBase64 -filePath $KQLDatabasePathDefinition
            
            if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "DatabaseProperties.json"
                    payload     = $KQLDatabaseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in KQLDatabase definition." -Level Error
                return $null
            }
        }

        if ($KQLDatabasePathPlatformDefinition) {
            $KQLDatabaseEncodedPlatformContent = Convert-ToBase64 -filePath $KQLDatabasePathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLDatabaseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        if ($KQLDatabasePathSchemaDefinition) {
            $KQLDatabaseEncodedSchemaContent = Convert-ToBase64 -filePath $KQLDatabasePathSchemaDefinition

            if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedSchemaContent)) {

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "DatabaseSchema.kql"
                    payload     = $KQLDatabaseEncodedSchemaContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in schema definition." -Level Error
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
                Write-Message -Message "Update definition for KQLDatabase '$KQLDatabaseId' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Update definition for KQLDatabase '$KQLDatabaseId' accepted. Operation in progress!" -Level Info
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
                    Write-Message -Message "Operation completed successfully." -Level Info
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
        Write-Message -Message "Failed to update KQLDatabase. Error: $errorDetails" -Level Error
    }
}
