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
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/KQLDashboards/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId

        if($KQLDashboardPathPlatformDefinition){
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
                Write-Message -Message "Update definition for KQLDashboard '$KQLDashboardId' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Update definition for KQLDashboard '$KQLDashboardId' accepted. Operation in progress!" -Level Info
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
        Write-Message -Message "Failed to update KQLDashboard. Error: $errorDetails" -Level Error
    }
}
