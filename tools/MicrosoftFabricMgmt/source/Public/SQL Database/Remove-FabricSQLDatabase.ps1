<#
.SYNOPSIS
    Removes a SQL Database from a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a SQL Database
    from the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the SQL Database.

.PARAMETER SQLDatabaseId
    The unique identifier of the SQL Database to delete.

.EXAMPLE
    Remove-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Removes the specified SQL Database from the workspace.

.EXAMPLE
    Get-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseName "OldDB" | Remove-FabricSQLDatabase

    Removes a SQL Database by piping it from Get-FabricSQLDatabase.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Remove-FabricSQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SQLDatabaseId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'sqlDatabases' -ItemId $SQLDatabaseId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }

            if ($PSCmdlet.ShouldProcess($SQLDatabaseId, "Remove SQL Database from workspace '$WorkspaceId'")) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "SQL Database '$SQLDatabaseId' removed successfully!" -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove SQL Database. Error: $errorDetails" -Level Error
        }
    }
}
