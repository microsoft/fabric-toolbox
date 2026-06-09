<#
.SYNOPSIS
    Creates a new Snowflake Database in a Fabric workspace.

.DESCRIPTION
    The New-FabricSnowflakeDatabase cmdlet creates a new Snowflake Database within a specified Fabric workspace.
    The Snowflake Database can be created with just a name and optional description, or with a full definition.

.PARAMETER WorkspaceId
    The GUID of the workspace where the Snowflake Database will be created.

.PARAMETER SnowflakeDatabaseName
    The display name for the new Snowflake Database.

.PARAMETER Description
    Optional. A description for the Snowflake Database.

.PARAMETER CreationPayload
    Optional. A hashtable containing the creation payload for the Snowflake Database.

.PARAMETER Definition
    Optional. A hashtable containing the Snowflake Database definition with parts array.

.EXAMPLE
    New-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseName "MySnowflakeDB"

    Creates a new Snowflake Database with the specified name.

.EXAMPLE
    New-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseName "MySnowflakeDB" -Description "My Snowflake database"

    Creates a new Snowflake Database with a name and description.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function New-FabricSnowflakeDatabase {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SnowflakeDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$CreationPayload,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'snowflakeDatabases'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{
                displayName = $SnowflakeDatabaseName
            }

            if ($Description) {
                $body.description = $Description
            }

            if ($CreationPayload) {
                $body.creationPayload = $CreationPayload
            }

            if ($Definition) {
                $body.definition = $Definition
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Snowflake Database '$SnowflakeDatabaseName'", "Create")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    Write-FabricLog -Message "Snowflake Database '$SnowflakeDatabaseName' created successfully." -Level Debug
                    return $response
                }
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create Snowflake Database '$SnowflakeDatabaseName'. Error: $errorDetails" -Level Error
        }
    }
}
