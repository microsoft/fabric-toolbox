<#
.SYNOPSIS
    Gets the definition of a Snowflake Database from a Fabric workspace.

.DESCRIPTION
    The Get-FabricSnowflakeDatabaseDefinition cmdlet retrieves the public definition of a Snowflake Database
    from a specified workspace. This API supports long running operations (LRO).

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Snowflake Database.

.PARAMETER SnowflakeDatabaseId
    The GUID of the Snowflake Database whose definition to retrieve.

.EXAMPLE
    Get-FabricSnowflakeDatabaseDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Retrieves the definition of the specified Snowflake Database.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricSnowflakeDatabaseDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
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
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'snowflakeDatabases' -ItemId "$SnowflakeDatabaseId/getDefinition"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request (POST to getDefinition)
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($response) {
                Write-FabricLog -Message "Snowflake Database definition retrieved successfully." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Snowflake Database definition for '$SnowflakeDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
