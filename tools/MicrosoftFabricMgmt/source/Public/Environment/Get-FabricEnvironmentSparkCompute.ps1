<#
.SYNOPSIS
Retrieves the Spark compute details for a specific environment in a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricEnvironmentSparkCompute function communicates with the Microsoft Fabric API to fetch information
about Spark compute resources associated with a specified environment. It ensures that the API token is valid
and gracefully handles errors during the API call.

.PARAMETER WorkspaceId
The unique identifier of the workspace containing the target environment.

.PARAMETER EnvironmentId
The unique identifier of the environment whose Spark compute details are being retrieved.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricEnvironmentSparkCompute -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Retrieves Spark compute details for the specified environment in the given workspace.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Get-FabricEnvironmentSparkCompute {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter()]
        [switch]$Raw
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "environments/$EnvironmentId/sparkcompute"

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        if ($Raw) {
            return $dataItems
        }

        # Enrich with resolved workspace and capacity names
        $workspaceName = $null
        try {
            $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
        }
        catch {
            $workspaceName = $WorkspaceId
            Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
        }

        $capacityName = $null
        try {
            $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $WorkspaceId
            if ($capacityId) {
                $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
            }
        }
        catch {
            Write-FabricLog -Message "Failed to resolve capacity name for workspace ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
        }

        foreach ($item in $dataItems) {
            $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
            $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
            if ($null -ne $capacityName) {
                $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
            }
        }

        $dataItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.EnvironmentSparkCompute'
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment Spark compute. Error: $errorDetails" -Level Error
    }

}
