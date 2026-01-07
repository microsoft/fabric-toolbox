<#
.SYNOPSIS
Creates a new KQL Database in a workspace.

.DESCRIPTION
The New-FabricKQLDatabase cmdlet provisions a new KQL Database resource inside a specified Fabric workspace. You can
create either a ReadWrite database or a Shortcut database that points to an existing Kusto source via invitation token
or cluster/database references. If definition files are supplied they take precedence and are sent as multi-part inline
Base64 payloads. For Shortcut or ReadWrite types, parentEventhouseId is required to associate the database with its
Eventhouse container.

.PARAMETER WorkspaceId
The GUID of the workspace in which the KQL Database will be created. Required for all calls.

.PARAMETER KQLDatabaseName
The display name of the KQL Database. Must use only letters, numbers, spaces, and underscores. Choose a name that
clearly reflects analytical purpose.

.PARAMETER KQLDatabaseDescription
Optional descriptive text to explain the database’s contents, data domain, or usage patterns for discoverability.

.PARAMETER parentEventhouseId
The GUID of the parent Eventhouse. Required for both ReadWrite and Shortcut types so the service can link the database
to its logical container.

.PARAMETER KQLDatabaseType
Specifies the database type. Use ReadWrite for a standard editable database or Shortcut when referencing an external
Kusto database via invitation token or cluster/database pair.

.PARAMETER KQLInvitationToken
Optional invitation token granting access to an external Kusto database. When provided it overrides SourceClusterUri
and SourceDatabaseName parameters.

.PARAMETER KQLSourceClusterUri
Optional source cluster URI for Shortcut creation when an invitation token is not used. Must be combined with
KQLSourceDatabaseName.

.PARAMETER KQLSourceDatabaseName
Optional source database name for Shortcut creation when using cluster URI instead of invitation token. Required if
KQLSourceClusterUri is specified.

.PARAMETER KQLDatabasePathDefinition
Optional path to a database properties definition file. When provided, the file content is Base64 encoded and sent as a
definition part named DatabaseProperties.json.

.PARAMETER KQLDatabasePathPlatformDefinition
Optional path to a .platform file providing platform-specific configuration. Added as a Base64 encoded part when present.

.PARAMETER KQLDatabasePathSchemaDefinition
Optional path to a KQL schema definition file (e.g. DatabaseSchema.kql). Added as a Base64 encoded part when present.

.EXAMPLE
New-FabricKQLDatabase -WorkspaceId "workspace-12345" -KQLDatabaseName "SalesOps" -parentEventhouseId "eventhouse-1111" -KQLDatabaseType ReadWrite -KQLDatabaseDescription "Sales operational metrics and usage logs"

Creates a standard ReadWrite KQL Database associated with an Eventhouse and adds a descriptive summary.

.EXAMPLE
New-FabricKQLDatabase -WorkspaceId "workspace-12345" -KQLDatabaseName "ExternalRef" -parentEventhouseId "eventhouse-1111" -KQLDatabaseType Shortcut -KQLInvitationToken "invitation-token-value"

Creates a Shortcut KQL Database pointing to an external Kusto source using an invitation token.

.EXAMPLE
New-FabricKQLDatabase -WorkspaceId "workspace-12345" -KQLDatabaseName "Marketing" -parentEventhouseId "eventhouse-1111" -KQLDatabaseType ReadWrite -KQLDatabasePathDefinition "C:\defs\DatabaseProperties.json" -KQLDatabasePathSchemaDefinition "C:\defs\DatabaseSchema.kql"

Creates a ReadWrite KQL Database using provided definition and schema file parts.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.
- Definition file parts take precedence over creation payload shortcuts. Invitation token overrides source cluster info.

Author: Tiago Balabuch

#>

function New-FabricKQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

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
                Write-FabricLog -Message "Invalid or empty content in KQLDatabase definition." -Level Error
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

        }
        else {
            if ($KQLDatabaseType -eq "Shortcut") {
                if (-not $parentEventhouseId) {
                    Write-FabricLog -Message "Error: 'parentEventhouseId' is required for Shortcut type." -Level Error
                    return $null
                }
                if (-not ($KQLInvitationToken -or $KQLSourceClusterUri -or $KQLSourceDatabaseName)) {
                    Write-FabricLog -Message "Error: Provide either 'KQLInvitationToken', 'KQLSourceClusterUri', or 'KQLSourceDatabaseName'." -Level Error
                    return $null
                }
                if ($KQLInvitationToken) {
                    Write-FabricLog -Message "Info: 'KQLInvitationToken' is provided." -Level Warning

                    if ($KQLSourceClusterUri) {
                        Write-FabricLog -Message "Warning: 'KQLSourceClusterUri' is ignored when 'KQLInvitationToken' is provided." -Level Warning
                        #$KQLSourceClusterUri = $null
                    }
                    if ($KQLSourceDatabaseName) {
                        Write-FabricLog -Message "Warning: 'KQLSourceDatabaseName' is ignored when 'KQLInvitationToken' is provided." -Level Warning
                        #$KQLSourceDatabaseName = $null
                    }
                }
                if ($KQLSourceClusterUri -and -not $KQLSourceDatabaseName) {
                    Write-FabricLog -Message "Error: 'KQLSourceDatabaseName' is required when 'KQLSourceClusterUri' is provided." -Level Error
                    return $null
                }
            }

            # Validate ReadWrite type database
            if ($KQLDatabaseType -eq "ReadWrite" -and -not $parentEventhouseId) {
                Write-FabricLog -Message "Error: 'parentEventhouseId' is required for ReadWrite type." -Level Error
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
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDatabaseName, "Create KQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDatabase '$KQLDatabaseName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create KQLDatabase. Error: $errorDetails" -Level Error
    }
}
