<#
.SYNOPSIS
    Gets a SQL Database or lists all SQL Databases in a workspace.

.DESCRIPTION
    The Get-FabricSQLDatabase cmdlet retrieves SQL Database items from a specified Microsoft Fabric workspace.
    You can list all SQL Databases or filter by a specific SQLDatabaseId or display name.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the SQL Database resources.

.PARAMETER SQLDatabaseId
    Optional. Returns only the SQL Database matching this resource Id.

.PARAMETER SQLDatabaseName
    Optional. Returns only the SQL Database whose display name exactly matches this value.

.PARAMETER Raw
    Optional. When specified, returns the raw API response with resolved CapacityName and WorkspaceName
    properties added directly to the output objects.

.EXAMPLE
    Get-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all SQL Databases in the specified workspace.

.EXAMPLE
    Get-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the SQL Database with the specified Id.

.EXAMPLE
    Get-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseName "SalesDB"

    Returns the SQL Database with the specified name.

.EXAMPLE
    Get-FabricSQLDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -Raw | Export-Csv -Path "sqldatabases.csv"

    Exports all SQL Databases with resolved names to a CSV file.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricSQLDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SQLDatabaseName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($SQLDatabaseId -and $SQLDatabaseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'SQLDatabaseId' or 'SQLDatabaseName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'sqlDatabases'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $SQLDatabaseId -DisplayName $SQLDatabaseName -ResourceType 'SQLDatabase' -TypeName 'MicrosoftFabric.SQLDatabase' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve SQL Database for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
