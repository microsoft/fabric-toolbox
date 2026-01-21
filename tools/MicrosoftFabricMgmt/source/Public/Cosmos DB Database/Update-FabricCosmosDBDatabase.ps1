<#
.SYNOPSIS
    Updates an existing Cosmos DB Database in a Fabric workspace.

.DESCRIPTION
    The Update-FabricCosmosDBDatabase cmdlet updates the properties of a Cosmos DB Database in a specified workspace.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Cosmos DB Database.

.PARAMETER CosmosDBDatabaseId
    The GUID of the Cosmos DB Database to update.

.PARAMETER CosmosDBDatabaseName
    Optional. The new display name for the Cosmos DB Database.

.PARAMETER Description
    Optional. The new description for the Cosmos DB Database.

.EXAMPLE
    Update-FabricCosmosDBDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -CosmosDBDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -CosmosDBDatabaseName "NewName"

    Updates the display name of the specified Cosmos DB Database.

.NOTES
    - Requires `$FabricAuthContext` global configuration.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricCosmosDBDatabase {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CosmosDBDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CosmosDBDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description
    )

    process {
        try {
            if (-not $CosmosDBDatabaseName -and -not $Description) {
                Write-FabricLog -Message "At least one of 'CosmosDBDatabaseName' or 'Description' must be specified." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'cosmosDbDatabases' -ItemId $CosmosDBDatabaseId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{}

            if ($CosmosDBDatabaseName) {
                $body.displayName = $CosmosDBDatabaseName
            }

            if ($Description) {
                $body.description = $Description
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Cosmos DB Database '$CosmosDBDatabaseId'", "Update")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Patch'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    Write-FabricLog -Message "Cosmos DB Database '$CosmosDBDatabaseId' updated successfully." -Level Debug
                    return $response
                }
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Cosmos DB Database '$CosmosDBDatabaseId'. Error: $errorDetails" -Level Error
        }
    }
}
