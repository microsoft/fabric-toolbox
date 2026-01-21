<#
.SYNOPSIS
    Updates the definition of a Snowflake Database in a Fabric workspace.

.DESCRIPTION
    The Update-FabricSnowflakeDatabaseDefinition cmdlet overrides the definition for the specified Snowflake Database.
    This API supports long running operations (LRO).

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Snowflake Database.

.PARAMETER SnowflakeDatabaseId
    The GUID of the Snowflake Database whose definition to update.

.PARAMETER Definition
    The definition object containing the parts array to update.

.EXAMPLE
    $definition = @{
        parts = @(
            @{
                path = "config.json"
                payload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes('{"config": "content"}'))
                payloadType = "InlineBase64"
            }
        )
    }
    Update-FabricSnowflakeDatabaseDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Definition $definition

    Updates the definition of the specified Snowflake Database.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricSnowflakeDatabaseDefinition {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SnowflakeDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'snowflakeDatabases' -ItemId "$SnowflakeDatabaseId/updateDefinition"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{
                definition = $Definition
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Snowflake Database definition '$SnowflakeDatabaseId'", "Update")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Snowflake Database definition updated successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Snowflake Database definition for '$SnowflakeDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
