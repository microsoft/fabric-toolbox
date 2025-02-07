<#
.SYNOPSIS
Creates a new KQLQueryset in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new KQLQueryset 
in the specified workspace. It supports optional parameters for KQLQueryset description 
and path definitions for the KQLQueryset content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the KQLQueryset will be created.

.PARAMETER KQLQuerysetName
The name of the KQLQueryset to be created.

.PARAMETER KQLQuerysetDescription
An optional description for the KQLQueryset.

.PARAMETER KQLQuerysetPathDefinition
An optional path to the KQLQueryset definition file (e.g., .ipynb file) to upload.

.PARAMETER KQLQuerysetPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricKQLQueryset -WorkspaceId "workspace-12345" -KQLQuerysetName "New KQLQueryset" -KQLQuerysetPathDefinition "C:\KQLQuerysets\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function New-FabricKQLQueryset {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLQuerysetName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetDescription,

        [Parameter(Mandatory = $false)]
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
        $apiEndpointUrl = "{0}/workspaces/{1}/kqlQuerysets" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $KQLQuerysetName
        }

        if ($KQLQuerysetDescription) {
            $body.description = $KQLQuerysetDescription
        }

        if ($KQLQuerysetPathDefinition) {
            $KQLQuerysetEncodedContent = Convert-ToBase64 -filePath $KQLQuerysetPathDefinition

            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $null
                        parts  = @()
                    }
                }

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
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $null
                        parts  = @()
                    }
                }

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
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-Message -Message "KQLQueryset '$KQLQuerysetName' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "KQLQueryset '$KQLQuerysetName' creation accepted. Provisioning in progress!" -Level Info
               
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Getting Long Running Operation status" -Level Debug
               
                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId
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
        Write-Message -Message "Failed to create KQLQueryset. Error: $errorDetails" -Level Error
    }
}
