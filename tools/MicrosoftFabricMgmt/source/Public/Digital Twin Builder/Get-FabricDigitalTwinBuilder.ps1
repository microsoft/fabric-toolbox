<#
.SYNOPSIS
    Retrieves details of one or more Digital Twin Builder items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Digital Twin Builder information from a Microsoft Fabric workspace by DigitalTwinBuilderId or DigitalTwinBuilderName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Digital Twin Builder(s).
    If neither DigitalTwinBuilderId nor DigitalTwinBuilderName is specified, returns all Digital Twin Builder items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder item(s). This parameter is required.

.PARAMETER DigitalTwinBuilderId
    The unique identifier of the Digital Twin Builder item to retrieve. Optional; specify either DigitalTwinBuilderId or DigitalTwinBuilderName, not both.

.PARAMETER DigitalTwinBuilderName
    The display name of the Digital Twin Builder item to retrieve. Optional; specify either DigitalTwinBuilderId or DigitalTwinBuilderName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricDigitalTwinBuilder -WorkspaceId "workspace-12345" -DigitalTwinBuilderId "DigitalTwinBuilder-67890"
    Retrieves the Digital Twin Builder with ID "DigitalTwinBuilder-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricDigitalTwinBuilder -WorkspaceId "workspace-12345" -DigitalTwinBuilderName "My Digital Twin Builder"
    Retrieves the Digital Twin Builder named "My Digital Twin Builder" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricDigitalTwinBuilder -WorkspaceId "workspace-12345"
    Retrieves all Digital Twin Builder items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricDigitalTwinBuilder -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Digital Twin Builder items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricDigitalTwinBuilder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DigitalTwinBuilderName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'digitaltwinbuilders'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $DigitalTwinBuilderId -DisplayName $DigitalTwinBuilderName -ResourceType 'Digital Twin Builder' -TypeName 'MicrosoftFabric.DigitalTwinBuilder' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Digital Twin Builder for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
