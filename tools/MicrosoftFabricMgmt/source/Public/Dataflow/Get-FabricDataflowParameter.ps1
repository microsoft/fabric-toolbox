<#
.SYNOPSIS
    Gets the parameters of a Dataflow from a Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the discoverable parameters from a Dataflow's definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Dataflow.

.PARAMETER DataflowId
    The unique identifier of the Dataflow.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Get-FabricDataflowParameter -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Gets the parameters of the specified Dataflow.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricDataflowParameter {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataflowId,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows' -ItemId "$DataflowId/parameters"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No parameters found for Dataflow." -Level Warning
                return $null
            }

            if ($Raw) {
                return $response
            }

            Write-FabricLog -Message "Dataflow parameters retrieved successfully." -Level Debug

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

            $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.DataflowParameter'
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Dataflow parameters. Error: $errorDetails" -Level Error
        }
    }
}
