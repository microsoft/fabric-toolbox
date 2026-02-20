<#
.SYNOPSIS
    Creates a new SQL Database in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new SQL Database
    in the specified workspace. This is a long-running operation (LRO).

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SQL Database will be created.

.PARAMETER SQLDatabaseName
    The name of the SQL Database to be created.

.PARAMETER SQLDatabaseDescription
    An optional description for the SQL Database.

.PARAMETER Definition
    Optional. The definition of the SQL Database as a hashtable containing the parts.

.EXAMPLE
    New-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseName "SalesDB"

    Creates a new SQL Database named "SalesDB" in the specified workspace.

.EXAMPLE
    New-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseName "SalesDB" -SQLDatabaseDescription "Sales data storage"

    Creates a new SQL Database with a description.

.NOTES
    - This operation is a long-running operation (LRO).
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function New-FabricSQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SQLDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLDatabaseDescription,

        [Parameter(Mandatory = $false)]
        [hashtable]$Definition
    )

    try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'sqlDatabases'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $SQLDatabaseName
        }

        if ($SQLDatabaseDescription) {
            $body.description = $SQLDatabaseDescription
        }

        if ($Definition) {
            $body.definition = $Definition
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

        if ($PSCmdlet.ShouldProcess($SQLDatabaseName, "Create SQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "SQL Database '$SQLDatabaseName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create SQL Database. Error: $errorDetails" -Level Error
    }
}
