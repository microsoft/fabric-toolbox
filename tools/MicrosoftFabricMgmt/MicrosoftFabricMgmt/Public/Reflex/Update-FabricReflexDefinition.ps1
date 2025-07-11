<#
.SYNOPSIS
    Updates the definition of an existing Reflex in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Reflex 
    in the specified workspace. It supports optional parameters for Reflex definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is mandatory.

.PARAMETER ReflexId
    The unique identifier of the Reflex to be updated. This parameter is mandatory.

.PARAMETER ReflexPathDefinition
    An optional path to the Reflex definition file to upload.

.PARAMETER ReflexPathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
    Update-FabricReflexDefinition -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890" -ReflexPathDefinition "C:\Path\To\ReflexDefinition.json"
    This example updates the definition of the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricReflexDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexPathPlatformDefinition
    )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/reflexes/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReflexId

        #if ($UpdateMetadata -eq $true) {
        if($ReflexPathPlatformDefinition){
            $apiEndpointUrl = "?updateMetadata=true" -f $apiEndpointUrl 
        }
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts  = @()
            } 
        }
      
        if ($ReflexPathDefinition) {
            $ReflexEncodedContent = Convert-ToBase64 -filePath $ReflexPathDefinition
            
            if (-not [string]::IsNullOrEmpty($ReflexEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "ReflexEntities.json"
                    payload     = $ReflexEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in Reflex definition." -Level Error
                return $null
            }
        }

        if ($ReflexPathPlatformDefinition) {
            $ReflexEncodedPlatformContent = Convert-ToBase64 -filePath $ReflexPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($ReflexEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $ReflexEncodedPlatformContent
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
                Write-Message -Message "Update definition for Reflex '$ReflexId' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Update definition for Reflex '$ReflexId' accepted. Operation in progress!" -Level Info
                
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
                Write-Message -Message "Unexpected response code: $statusCode" -Level Error
                Write-Message -Message "Error details: $($response.message)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Reflex. Error: $errorDetails" -Level Error
    }
}
