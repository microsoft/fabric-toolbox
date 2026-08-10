<#
.SYNOPSIS
Retrieves the workspaces associated with a specific domain in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricDomainWorkspace` function fetches the workspaces for the given domain ID.

.PARAMETER DomainId
The ID of the domain for which to retrieve workspaces.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricDomainWorkspace -DomainId "12345"

Fetches workspaces for the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Get-FabricDomainWorkspace {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter()]
        [switch]$Raw
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains', $DomainId, 'workspaces')
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

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

        # Each returned item is a workspace; resolve names from its own id
        foreach ($item in $dataItems) {
            $wsId = $item.id
            if (-not $wsId) {
                continue
            }

            try {
                $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $wsId
            }
            catch {
                $workspaceName = $wsId
                Write-FabricLog -Message "Failed to resolve workspace name for ID '$wsId': $($_.Exception.Message)" -Level Debug
            }
            $item | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force

            try {
                $capacityId = Resolve-FabricCapacityIdFromWorkspace -WorkspaceId $wsId
                if ($capacityId) {
                    $capacityName = Resolve-FabricCapacityName -CapacityId $capacityId
                    if ($null -ne $capacityName) {
                        $item | Add-Member -NotePropertyName 'CapacityName' -NotePropertyValue $capacityName -Force
                    }
                }
            }
            catch {
                Write-FabricLog -Message "Failed to resolve capacity name for workspace ID '$wsId': $($_.Exception.Message)" -Level Debug
            }
        }

        $dataItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.DomainWorkspace'
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = Get-ErrorResponse($_.Exception)
        Write-FabricLog -Message "Failed to retrieve domain workspaces. Error: $errorDetails" -Level Error
    }
}
