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
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
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
        
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "KQLDatabase '$KQLDatabaseName' created successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create KQLDatabase. Error: $errorDetails" -Level Error
    }
}
