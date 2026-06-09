<#
.SYNOPSIS
Retrieves SQL Endpoints from a specified workspace in Fabric.

.DESCRIPTION
The Get-FabricSQLEndpoint function retrieves SQL Endpoints from a specified workspace in Fabric.
It supports filtering by SQL Endpoint ID or SQL Endpoint Name. If both filters are provided,
an error message is returned. The function handles token validation, API requests with continuation
tokens, and processes the response to return the desired SQL Endpoint(s).

.PARAMETER WorkspaceId
The ID of the workspace from which to retrieve SQL Endpoints. This parameter is mandatory.

.PARAMETER SQLEndpointId
The ID of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointName.

.PARAMETER SQLEndpointName
The name of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointId.

.PARAMETER Raw
If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointName "MySQLEndpoint"

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -Raw

Retrieves all SQL Endpoints in the workspace with raw API response format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026



#>
function Get-FabricSQLEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$SQLEndpointName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($SQLEndpointId -and $SQLEndpointName) {
                Write-FabricLog -Message "Specify only one parameter: either 'SQLEndpointId' or 'SQLEndpointName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/SQLEndpoints" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $SQLEndpointId -DisplayName $SQLEndpointName -ResourceType 'SQLEndpoint' -TypeName 'MicrosoftFabric.SQLEndpoint' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve SQL Endpoint for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
