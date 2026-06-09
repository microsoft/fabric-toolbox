<#
.SYNOPSIS
    Updates an existing Snowflake Database in a Fabric workspace.

.DESCRIPTION
    The Update-FabricSnowflakeDatabase cmdlet updates the properties of a Snowflake Database in a specified workspace.
    You can update the display name and/or description.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Snowflake Database.

.PARAMETER SnowflakeDatabaseId
    The GUID of the Snowflake Database to update.

.PARAMETER SnowflakeDatabaseName
    Optional. The new display name for the Snowflake Database.

.PARAMETER Description
    Optional. The new description for the Snowflake Database.

.EXAMPLE
    Update-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -SnowflakeDatabaseName "NewName"

    Updates the display name of the specified Snowflake Database.

.EXAMPLE
    Update-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Description "Updated description"

    Updates the description of the specified Snowflake Database.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricSnowflakeDatabase {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SnowflakeDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SnowflakeDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description
    )

    process {
        try {
            if (-not $SnowflakeDatabaseName -and -not $Description) {
                Write-FabricLog -Message "At least one of 'SnowflakeDatabaseName' or 'Description' must be specified." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'snowflakeDatabases' -ItemId $SnowflakeDatabaseId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{}

            if ($SnowflakeDatabaseName) {
                $body.displayName = $SnowflakeDatabaseName
            }

            if ($Description) {
                $body.description = $Description
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Snowflake Database '$SnowflakeDatabaseId'", "Update")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Patch'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    Write-FabricLog -Message "Snowflake Database '$SnowflakeDatabaseId' updated successfully." -Level Debug
                    return $response
                }
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Snowflake Database '$SnowflakeDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
