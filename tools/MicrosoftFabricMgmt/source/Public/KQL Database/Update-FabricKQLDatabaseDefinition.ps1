<#
.SYNOPSIS
Updates the definition of a KQLDatabase in a Microsoft Fabric workspace.

.DESCRIPTION
Updates the definition of a KQLDatabase by sending one or more definition parts to the Fabric API.
You can provide the primary database properties, an optional platform definition, and an optional schema definition.
Each file path you provide is read, encoded as Base64, and included in the request payload.

.PARAMETER WorkspaceId
Mandatory. The unique identifier of the workspace that contains the KQL Database. Use the workspace GUID, not the display name.

.PARAMETER KQLDatabaseId
Mandatory. The unique identifier (GUID) of the KQL Database whose definition should be updated.

.PARAMETER KQLDatabasePathDefinition
Mandatory. Full path to the primary definition file for the database (for example, DatabaseProperties.json). The file is read and Base64-encoded before being sent.

.PARAMETER KQLDatabasePathPlatformDefinition
Optional. Full path to a platform-specific definition file (for example, .platform). When provided, the file content is encoded and submitted as an additional definition part.

.PARAMETER KQLDatabasePathSchemaDefinition
Optional. Full path to a schema definition file (for example, DatabaseSchema.kql). When provided, the schema is included as another definition part in the update request.

.EXAMPLE
Update-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890" -KQLDatabasePathDefinition "C:\\KQL\DatabaseProperties.json"

Updates the KQL Database definition using only the primary definition file. This replaces properties using the provided JSON file.

.EXAMPLE
Update-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890" -KQLDatabasePathDefinition "C:\\KQL\DatabaseProperties.json" -KQLDatabasePathSchemaDefinition "C:\\KQL\DatabaseSchema.kql"

Updates the KQL Database and includes an updated schema definition by attaching both the properties and schema files to the request.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Each provided file is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>

function Update-FabricKQLDatabaseDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
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
    process {
        try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId
        if ($KQLDatabasePathPlatformDefinition) {
            # Append query parameter correctly
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
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
                Write-FabricLog -Message "Invalid or empty content in KQLDatabase definition." -Level Error
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
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
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
                Write-FabricLog -Message "Invalid or empty content in schema definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDatabaseId, "Update KQL Database definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for KQL Database with ID '$KQLDatabaseId' in workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update KQLDatabase. Error: $errorDetails" -Level Error
        }
    }
}
