<#
.SYNOPSIS
    Removes a Cosmos DB Database from a Fabric workspace.

.DESCRIPTION
    The Remove-FabricCosmosDBDatabase cmdlet deletes a Cosmos DB Database from a specified workspace.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Cosmos DB Database.

.PARAMETER CosmosDBDatabaseId
    The GUID of the Cosmos DB Database to delete.

.EXAMPLE
    Remove-FabricCosmosDBDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -CosmosDBDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Deletes the specified Cosmos DB Database from the workspace.

.NOTES
    - Requires `$FabricAuthContext` global configuration.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Remove-FabricCosmosDBDatabase {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CosmosDBDatabaseId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'cosmosDbDatabases' -ItemId $CosmosDBDatabaseId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Cosmos DB Database '$CosmosDBDatabaseId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Delete'
                }
                Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Cosmos DB Database '$CosmosDBDatabaseId' deleted successfully." -Level Debug
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Cosmos DB Database '$CosmosDBDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
