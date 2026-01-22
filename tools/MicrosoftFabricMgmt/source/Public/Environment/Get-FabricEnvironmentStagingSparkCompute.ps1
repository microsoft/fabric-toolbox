<#
.SYNOPSIS
Retrieves staging Spark compute details for a specific environment in a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricEnvironmentStagingSparkCompute function interacts with the Microsoft Fabric API to fetch information
about staging Spark compute configurations for a specified environment. It ensures token validity and handles API errors gracefully.

.PARAMETER WorkspaceId
The unique identifier of the workspace containing the target environment.

.PARAMETER EnvironmentId
The unique identifier of the environment for which staging Spark compute details are being retrieved.

.EXAMPLE
Get-FabricEnvironmentStagingSparkCompute -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Retrieves the staging Spark compute configurations for the specified environment in the given workspace.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Get-FabricEnvironmentStagingSparkCompute {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "environments/$EnvironmentId/staging/sparkcompute"

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        Invoke-FabricAPIRequest @apiParams
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment staging Spark compute. Error: $errorDetails" -Level Error
    }

}
