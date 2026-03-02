<#
.SYNOPSIS
    Gets a Snowflake Database or lists all Snowflake Databases in a workspace.

.DESCRIPTION
    The Get-FabricSnowflakeDatabase cmdlet retrieves Snowflake Database items from a specified Microsoft Fabric workspace.
    You can list all Snowflake Databases or filter by a specific SnowflakeDatabaseId or display name.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Snowflake Database resources.

.PARAMETER SnowflakeDatabaseId
    Optional. Returns only the Snowflake Database matching this resource Id.

.PARAMETER SnowflakeDatabaseName
    Optional. Returns only the Snowflake Database whose display name exactly matches this value.

.PARAMETER Raw
    Optional. When specified, returns the raw API response with resolved CapacityName and WorkspaceName
    properties added directly to the output objects.

.EXAMPLE
    Get-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all Snowflake Databases in the specified workspace.

.EXAMPLE
    Get-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the Snowflake Database with the specified Id.

.EXAMPLE
    Get-FabricSnowflakeDatabase -WorkspaceId "12345678-1234-1234-1234-123456789012" -SnowflakeDatabaseName "MySnowflakeDB"

    Returns the Snowflake Database with the specified name.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricSnowflakeDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SnowflakeDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SnowflakeDatabaseName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($SnowflakeDatabaseId -and $SnowflakeDatabaseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'SnowflakeDatabaseId' or 'SnowflakeDatabaseName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'snowflakeDatabases'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $SnowflakeDatabaseId -DisplayName $SnowflakeDatabaseName -ResourceType 'SnowflakeDatabase' -TypeName 'MicrosoftFabric.SnowflakeDatabase' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Snowflake Database for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
