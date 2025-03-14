<#
.SYNOPSIS
Creates a new KQLDashboard in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new KQLDashboard 
in the specified workspace. It supports optional parameters for KQLDashboard description 
and path definitions for the KQLDashboard content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the KQLDashboard will be created.

.PARAMETER KQLDashboardName
The name of the KQLDashboard to be created.

.PARAMETER KQLDashboardDescription
An optional description for the KQLDashboard.

.PARAMETER KQLDashboardPathDefinition
An optional path to the KQLDashboard definition file (e.g., .ipynb file) to upload.

.PARAMETER KQLDashboardPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricKQLDashboard -WorkspaceId "workspace-12345" -KQLDashboardName "New KQLDashboard" -KQLDashboardPathDefinition "C:\KQLDashboards\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function New-FabricKQLDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDashboardName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardDescription,

        [Parameter(Mandatory = $false)]
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
        $apiEndpointUrl = "{0}/workspaces/{1}/kqlDashboards" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $KQLDashboardName
        }

        if ($KQLDashboardDescription) {
            $body.description = $KQLDashboardDescription
        }

        if ($KQLDashboardPathDefinition) {
            $KQLDashboardEncodedContent = Convert-ToBase64 -filePath $KQLDashboardPathDefinition

            if (-not [string]::IsNullOrEmpty($KQLDashboardEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "KQLDashboard"
                        parts  = @()
                    }
                }

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
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-Message -Message "KQLDashboard '$KQLDashboardName' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "KQLDashboard '$KQLDashboardName' creation accepted. Provisioning in progress!" -Level Info
               
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
        Write-Message -Message "Failed to create KQLDashboard. Error: $errorDetails" -Level Error
    }
}
