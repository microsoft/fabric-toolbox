<#
.SYNOPSIS
Creates a new KQLDatabase in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new KQLDatabase 
in the specified workspace. It supports optional parameters for KQLDatabase description 
and path definitions for the KQLDatabase content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the KQLDatabase will be created.

.PARAMETER KQLDatabaseName
The name of the KQLDatabase to be created.

.PARAMETER KQLDatabaseDescription
An optional description for the KQLDatabase.

.PARAMETER KQLDatabasePathDefinition
An optional path to the KQLDatabase definition file (e.g., .ipynb file) to upload.

.PARAMETER KQLDatabasePathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricKQLDatabase -WorkspaceId "workspace-12345" -KQLDatabaseName "New KQLDatabase" -KQLDatabasePathDefinition "C:\KQLDatabases\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Precedent Request Body
    - Definition file high priority.
    - CreationPayload is evaluate only if Definition file is not provided.
        - invitationToken has priority over all other payload fields.

Author: Tiago Balabuch  

#>

function New-FabricKQLDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$parentEventhouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet("ReadWrite", "Shortcut")]
        [string]$KQLDatabaseType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLInvitationToken,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLSourceClusterUri,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLSourceDatabaseName,

        [Parameter(Mandatory = $false)]
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
        $apiEndpointUrl = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body ### This is working
        $body = @{
            displayName = $KQLDatabaseName
        }

        if ($KQLDatabaseDescription) {
            $body.description = $KQLDatabaseDescription
        }

        if ($KQLDatabasePathDefinition) {
            $KQLDatabaseEncodedContent = Convert-ToBase64 -filePath $KQLDatabasePathDefinition

            $body.definition = @{
                parts = @()
            }
  
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

        }
        else {
            if ($KQLDatabaseType -eq "Shortcut") {
                if (-not $parentEventhouseId) {
                    Write-Message -Message "Error: 'parentEventhouseId' is required for Shortcut type." -Level Error
                    return $null
                }
                if (-not ($KQLInvitationToken -or $KQLSourceClusterUri -or $KQLSourceDatabaseName)) {
                    Write-Message -Message "Error: Provide either 'KQLInvitationToken', 'KQLSourceClusterUri', or 'KQLSourceDatabaseName'." -Level Error
                    return $null
                }
                if ($KQLInvitationToken) {
                    Write-Message -Message "Info: 'KQLInvitationToken' is provided." -Level Warning

                    if ($KQLSourceClusterUri) {
                        Write-Message -Message "Warning: 'KQLSourceClusterUri' is ignored when 'KQLInvitationToken' is provided." -Level Warning
                        #$KQLSourceClusterUri = $null
                    }
                    if ($KQLSourceDatabaseName) {
                        Write-Message -Message "Warning: 'KQLSourceDatabaseName' is ignored when 'KQLInvitationToken' is provided." -Level Warning
                        #$KQLSourceDatabaseName = $null
                    }
                }
                if ($KQLSourceClusterUri -and -not $KQLSourceDatabaseName) {
                    Write-Message -Message "Error: 'KQLSourceDatabaseName' is required when 'KQLSourceClusterUri' is provided." -Level Error
                    return $null
                }
            }

            # Validate ReadWrite type database
            if ($KQLDatabaseType -eq "ReadWrite" -and -not $parentEventhouseId) {
                Write-Message -Message "Error: 'parentEventhouseId' is required for ReadWrite type." -Level Error
                return $null
            }

            $body.creationPayload = @{
                databaseType           = $KQLDatabaseType
                parentEventhouseItemId = $parentEventhouseId
            }

            if ($KQLDatabaseType -eq "Shortcut") {
                if ($KQLInvitationToken) {

                    $body.creationPayload.invitationToken = $KQLInvitationToken
                }
                if ($KQLSourceClusterUri -and -not $KQLInvitationToken) {
                    $body.creationPayload.sourceClusterUri = $KQLSourceClusterUri
                }
                if ($KQLSourceDatabaseName -and -not $KQLInvitationToken) {
                    $body.creationPayload.sourceDatabaseName = $KQLSourceDatabaseName
                }
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
                Write-Message -Message "KQLDatabase '$KQLDatabaseName' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "KQLDatabase '$KQLDatabaseName' creation accepted. Provisioning in progress!" -Level Info
               
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                [string]$retryAfter = $responseHeader["Retry-After"]

                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Location: '$location'" -Level Debug
                Write-Message -Message "Retry-After: '$retryAfter'" -Level Debug
                Write-Message -Message "Getting Long Running Operation status" -Level Debug
               
                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId
                Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug
                # Handle operation result
                if ($operationStatus.status -eq "Succeeded") {
                    Write-Message -Message "Operation Succeeded" -Level Debug
                    Write-Message -Message "Getting Long Running Operation result" -Level Debug
                
                    $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                    Write-Message -Message "Long Running Operation result: $operationResult" -Level Debug
                
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
        Write-Message -Message "Failed to create KQLDatabase. Error: $errorDetails" -Level Error
    }
}
