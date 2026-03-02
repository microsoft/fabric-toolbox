<#
.SYNOPSIS
    Updates an existing SQL Database in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update a SQL Database's
    display name and/or description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the SQL Database.

.PARAMETER SQLDatabaseId
    The unique identifier of the SQL Database to update.

.PARAMETER SQLDatabaseName
    Optional. The new display name for the SQL Database.

.PARAMETER SQLDatabaseDescription
    Optional. The new description for the SQL Database.

.EXAMPLE
    Update-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -SQLDatabaseName "UpdatedName"

    Updates the SQL Database's display name.

.EXAMPLE
    Update-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -SQLDatabaseDescription "New description"

    Updates the SQL Database's description.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricSQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SQLDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SQLDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLDatabaseDescription
    )

    try {
        # Validate at least one update parameter is provided
        if (-not $SQLDatabaseName -and -not $SQLDatabaseDescription) {
            Write-FabricLog -Message "At least one of 'SQLDatabaseName' or 'SQLDatabaseDescription' must be provided." -Level Error
            return
        }

        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'sqlDatabases' -ItemId $SQLDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($SQLDatabaseName) {
            $body.displayName = $SQLDatabaseName
        }

        if ($SQLDatabaseDescription) {
            $body.description = $SQLDatabaseDescription
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Patch'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess($SQLDatabaseId, "Update SQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "SQL Database '$SQLDatabaseId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SQL Database. Error: $errorDetails" -Level Error
    }
}
