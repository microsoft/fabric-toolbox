<#
.SYNOPSIS
    Retrieves details of one or more Map items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Map information from a Microsoft Fabric workspace by MapId or MapName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Map(s).
    If neither MapId nor MapName is specified, returns all Map items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Map item(s). This parameter is required.

.PARAMETER MapId
    The unique identifier of the Map item to retrieve. Optional; specify either MapId or MapName, not both.

.PARAMETER MapName
    The display name of the Map item to retrieve. Optional; specify either MapId or MapName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricMap -WorkspaceId "workspace-12345" -MapId "Map-67890"
    Retrieves the Map with ID "Map-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricMap -WorkspaceId "workspace-12345" -MapName "My Map"
    Retrieves the Map named "My Map" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricMap -WorkspaceId "workspace-12345"
    Retrieves all Map items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricMap -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Map items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricMap {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MapId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MapName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'Maps'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $MapId -DisplayName $MapName -ResourceType 'Map' -TypeName 'MicrosoftFabric.Map' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Map for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
