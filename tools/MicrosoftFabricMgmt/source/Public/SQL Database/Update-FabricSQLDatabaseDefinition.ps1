<#
.SYNOPSIS
    Updates the definition of a SQL Database in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition of a SQL Database.
    This is a long-running operation (LRO).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the SQL Database.

.PARAMETER SQLDatabaseId
    The unique identifier of the SQL Database.

.PARAMETER Definition
    The new definition for the SQL Database as a hashtable containing the parts.

.EXAMPLE
    $definition = @{
        parts = @(
            @{
                path = "sqldatabase.json"
                payload = "base64encodedcontent"
                payloadType = "InlineBase64"
            }
        )
    }
    Update-FabricSQLDatabaseDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Definition $definition

    Updates the SQL Database's definition.

.NOTES
    - This operation is a long-running operation (LRO).
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricSQLDatabaseDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SQLDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition
    )

    try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'sqlDatabases' -ItemId "$SQLDatabaseId/updateDefinition"
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = $Definition
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess($SQLDatabaseId, "Update SQL Database definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "SQL Database definition updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SQL Database definition. Error: $errorDetails" -Level Error
    }
}
