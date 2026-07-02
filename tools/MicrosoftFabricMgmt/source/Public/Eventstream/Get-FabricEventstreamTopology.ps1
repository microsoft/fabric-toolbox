<#
.SYNOPSIS
Retrieve the topology for an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamTopology sends a GET request to the Fabric API to obtain the topology for a specified Eventstream within a workspace. The function validates the authentication token before making the API call and returns the topology object or $null if no data is returned.

.PARAMETER WorkspaceId
The workspace ID that contains the Eventstream. (Required)

.PARAMETER EventstreamId
The Eventstream ID whose topology will be retrieved. (Required)

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricEventstreamTopology -WorkspaceId "12345" -EventstreamId "67890"
Retrieves the topology for eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token prior to the API request.
Author: Tiago Balabuch
#>

function Get-FabricEventstreamTopology {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter()]
        [switch]$Raw
    )
    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId
            $apiEndpointURI = "$apiEndpointURI/topology"

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
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

            $dataItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.EventstreamTopology'
            return $dataItems
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Eventstream Topology. Error: $errorDetails" -Level Error
        }
    }
}
