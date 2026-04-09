<#
.SYNOPSIS
    Retrieves details of one or more Digital Twin Builder Flow items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Digital Twin Builder Flow information from a Microsoft Fabric workspace by DigitalTwinBuilderFlowId or DigitalTwinBuilderFlowName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Digital Twin Builder Flow(s).
    If neither DigitalTwinBuilderFlowId nor DigitalTwinBuilderFlowName is specified, returns all Digital Twin Builder Flow items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder Flow item(s). This parameter is required.

.PARAMETER DigitalTwinBuilderFlowId
    The unique identifier of the Digital Twin Builder Flow item to retrieve. Optional; specify either DigitalTwinBuilderFlowId or DigitalTwinBuilderFlowName, not both.

.PARAMETER DigitalTwinBuilderFlowName
    The display name of the Digital Twin Builder Flow item to retrieve. Optional; specify either DigitalTwinBuilderFlowId or DigitalTwinBuilderFlowName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricDigitalTwinBuilderFlow -WorkspaceId "workspace-12345" -DigitalTwinBuilderFlowId "DigitalTwinBuilderFlow-67890"
    Retrieves the Digital Twin Builder Flow with ID "DigitalTwinBuilderFlow-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricDigitalTwinBuilderFlow -WorkspaceId "workspace-12345" -DigitalTwinBuilderFlowName "My Digital Twin Builder Flow"
    Retrieves the Digital Twin Builder Flow named "My Digital Twin Builder Flow" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricDigitalTwinBuilderFlow -WorkspaceId "workspace-12345"
    Retrieves all Digital Twin Builder Flow items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricDigitalTwinBuilderFlow -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Digital Twin Builder Flow items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricDigitalTwinBuilderFlow {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DigitalTwinBuilderFlowName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'DigitalTwinBuilderFlows'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $DigitalTwinBuilderFlowId -DisplayName $DigitalTwinBuilderFlowName -ResourceType 'Digital Twin Builder Flow' -TypeName 'MicrosoftFabric.DigitalTwinBuilderFlow' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Digital Twin Builder Flow for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
