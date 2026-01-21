<#
.SYNOPSIS
    Gets the definition of a SQL Database from a Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of a SQL Database. This is a long-running operation (LRO)
    that returns the SQL Database's definition including its parts.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the SQL Database.

.PARAMETER SQLDatabaseId
    The unique identifier of the SQL Database.

.EXAMPLE
    Get-FabricSQLDatabaseDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Gets the definition of the specified SQL Database.

.NOTES
    - This operation is a long-running operation (LRO).
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricSQLDatabaseDefinition {
    [CmdletBinding()]
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

            # Construct the API endpoint URI (POST to getDefinition)
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'sqlDatabases' -ItemId "$SQLDatabaseId/getDefinition"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No definition returned from the API." -Level Warning
                return $null
            }

            Write-FabricLog -Message "SQL Database definition retrieved successfully." -Level Debug
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve SQL Database definition. Error: $errorDetails" -Level Error
        }
    }
}
