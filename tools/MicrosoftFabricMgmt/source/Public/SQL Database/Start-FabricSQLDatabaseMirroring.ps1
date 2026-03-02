<#
.SYNOPSIS
    Starts mirroring for a SQL Database in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to start mirroring for a SQL Database.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the SQL Database.

.PARAMETER SQLDatabaseId
    The unique identifier of the SQL Database.

.EXAMPLE
    Start-FabricSQLDatabaseMirroring -WorkspaceId "12345678-1234-1234-1234-123456789012" -SQLDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Starts mirroring for the specified SQL Database.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Start-FabricSQLDatabaseMirroring {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'sqlDatabases' -ItemId "$SQLDatabaseId/startMirroring"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            if ($PSCmdlet.ShouldProcess($SQLDatabaseId, "Start mirroring for SQL Database in workspace '$WorkspaceId'")) {
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "SQL Database mirroring started successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to start SQL Database mirroring. Error: $errorDetails" -Level Error
        }
    }
}
