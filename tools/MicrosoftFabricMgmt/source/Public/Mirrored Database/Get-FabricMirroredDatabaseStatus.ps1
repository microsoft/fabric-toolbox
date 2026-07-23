<#
.SYNOPSIS
Gets the current mirroring status for a specific Mirrored Database.

.DESCRIPTION
The Get-FabricMirroredDatabaseStatus cmdlet calls the Fabric API to return the current mirroring state for a mirrored
database in a given workspace. Use this to verify whether mirroring is healthy, lagging, or encountering errors.

.PARAMETER WorkspaceId
The GUID of the workspace that contains the mirrored database. This value scopes the request to the correct Fabric
workspace and is required.

.PARAMETER MirroredDatabaseId
The Id of the mirrored database to check. Provide the resource Id so the API can return status for that specific item.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricMirroredDatabaseStatus -WorkspaceId 11111111-2222-3333-4444-555555555555 -MirroredDatabaseId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Returns the current mirroring status for the specified mirrored database.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricMirroredDatabaseStatus {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter()]
        [switch]$Raw
    )
    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/getMirroringStatus" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $MirroredDatabaseId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No data returned from the API." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseId' status retrieved successfully!" -Level Debug

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

            foreach ($item in $response) {
                $item | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force
                if ($null -ne $capacityName) {
                    $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
                }
            }

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.MirroredDatabaseStatus'
            return $response
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
        }

    }
}
