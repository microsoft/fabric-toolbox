<#
.SYNOPSIS
    Updates the definition of an existing SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing SemanticModel 
    in the specified workspace. It supports optional parameters for SemanticModel definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is mandatory.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be updated. This parameter is mandatory.

.PARAMETER SemanticModelPathDefinition
    An optional path to the SemanticModel definition file to upload.

.EXAMPLE
    Update-FabricSemanticModelDefinition -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelPathDefinition "C:\Path\To\SemanticModelDefinition.json"
    This example updates the definition of the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricSemanticModelDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelPathDefinition
    )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/SemanticModels/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts = @()
            } 
        }
      
        $jsonObjectParts = Get-FileDefinitionParts -sourceDirectory $SemanticModelPathDefinition
        # Add new part to the parts array
        $body.definition.parts = $jsonObjectParts.parts
        # Check if any path is .platform
        foreach ($part in $jsonObjectParts.parts) {
            if ($part.path -eq ".platform") {
                $hasPlatformFile = $true
                Write-Message -Message "Platform File: $hasPlatformFile" -Level Debug
            }
        }

        if ($hasPlatformFile -eq $true) {
            $apiEndpointUrl = "?updateMetadata=true" -f $apiEndpointUrl 
        }
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug


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
                Write-Message -Message "Update definition for SemanticModel '$SemanticModelId' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Update definition for SemanticModel '$SemanticModelId' accepted. Operation in progress!" -Level Info
                
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
                    Write-Message -Message "Update definition operation for Semantic Model '$SemanticModelId' succeeded!" -Level Info
                    return $operationStatus
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
        Write-Message -Message "Failed to update SemanticModel. Error: $errorDetails" -Level Error
    }
}
