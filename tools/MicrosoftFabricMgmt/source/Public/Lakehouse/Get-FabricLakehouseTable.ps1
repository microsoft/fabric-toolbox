<#
.SYNOPSIS
Gets table metadata for a Lakehouse.

.DESCRIPTION
The Get-FabricLakehouseTable cmdlet retrieves table metadata for a specified Lakehouse within a workspace. Use this to
inspect available tables or validate that ingestion has produced expected table objects.

.PARAMETER WorkspaceId
The GUID of the workspace hosting the Lakehouse. Required so the API can locate the Lakehouse resource scope.

.PARAMETER LakehouseId
The Id of the Lakehouse whose tables you want to enumerate. Required for the request URL. Provide the Lakehouse Id
returned from a prior Get-FabricLakehouse call.

.PARAMETER Raw
If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
Get-FabricLakehouseTable -WorkspaceId 11111111-2222-3333-4444-555555555555 -LakehouseId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Returns one or more table metadata objects for the specified Lakehouse.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricLakehouseTable {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter()]
        [switch]$Raw
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Initialize variables
        $maxResults = 1

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/tables?maxResults={3}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $LakehouseId, $maxResults
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        if ($Raw) {
            return $dataItems
        }

        Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug

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

        $dataItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.LakehouseTable'
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Lakehouse. Error: $errorDetails" -Level Error
    }

}
