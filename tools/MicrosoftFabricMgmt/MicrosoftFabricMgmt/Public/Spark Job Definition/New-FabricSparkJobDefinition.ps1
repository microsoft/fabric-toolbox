<#
.SYNOPSIS
    Creates a new SparkJobDefinition in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new SparkJobDefinition 
    in the specified workspace. It supports optional parameters for SparkJobDefinition description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition will be created. This parameter is mandatory.

.PARAMETER SparkJobDefinitionName
    The name of the SparkJobDefinition to be created. This parameter is mandatory.

.PARAMETER SparkJobDefinitionDescription
    An optional description for the SparkJobDefinition.

.PARAMETER SparkJobDefinitionPathDefinition
    An optional path to the SparkJobDefinition definition file to upload.

.PARAMETER SparkJobDefinitionPathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
    New-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionName "New SparkJobDefinition" -SparkJobDefinitionDescription "Description of the new SparkJobDefinition"
    This example creates a new SparkJobDefinition named "New SparkJobDefinition" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricSparkJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkJobDefinitionName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionPathPlatformDefinition
    )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/sparkJobDefinitions" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $SparkJobDefinitionName
        }

        if ($SparkJobDefinitionDescription) {
            $body.description = $SparkJobDefinitionDescription
        }
        if ($SparkJobDefinitionPathDefinition) {
            $SparkJobDefinitionEncodedContent = Convert-ToBase64 -filePath $SparkJobDefinitionPathDefinition

            if (-not [string]::IsNullOrEmpty($SparkJobDefinitionEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "SparkJobDefinitionV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "SparkJobDefinitionProperties.json"
                    payload     = $SparkJobDefinitionEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in SparkJobDefinition definition." -Level Error
                return $null
            }
        }

        if ($SparkJobDefinitionPathPlatformDefinition) {
            $SparkJobDefinitionEncodedPlatformContent = Convert-ToBase64 -filePath $SparkJobDefinitionPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($SparkJobDefinitionEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "SparkJobDefinitionV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $SparkJobDefinitionEncodedPlatformContent
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

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Post `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"
        
        Write-Message -Message "Response Code: $statusCode" -Level Debug
  
        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-Message -Message "Spark Job Definition '$SparkJobDefinitionName' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Spark Job Definition '$SparkJobDefinitionName' creation accepted. Provisioning in progress!" -Level Info
                
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
        Write-Message -Message "Failed to create Spark Job Definition. Error: $errorDetails" -Level Error
    }
}
