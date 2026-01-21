<#
.SYNOPSIS
    Removes a Snowflake Database from a Fabric workspace.

.DESCRIPTION
    The Remove-FabricSnowflakeDatabase cmdlet deletes a Snowflake Database from a specified workspace.
    This is a destructive operation and cannot be undone.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Snowflake Database.

.PARAMETER SnowflakeDatabaseId
    The GUID of the Snowflake Database to delete.

.EXAMPLE
    Remove-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Deletes the specified Snowflake Database from the workspace.

.EXAMPLE
    Get-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseName "OldDB" | Remove-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Deletes a Snowflake Database by piping from Get-FabricSnowflakeDatabase.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Remove-FabricSnowflakeDatabase {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SnowflakeDatabaseId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'snowflakeDatabases' -ItemId $SnowflakeDatabaseId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Snowflake Database '$SnowflakeDatabaseId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Delete'
                }
                Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Snowflake Database '$SnowflakeDatabaseId' deleted successfully." -Level Debug
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Snowflake Database '$SnowflakeDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
