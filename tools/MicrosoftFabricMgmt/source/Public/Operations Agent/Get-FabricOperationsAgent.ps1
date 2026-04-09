<#
.SYNOPSIS
    Retrieves details of one or more Operations Agent items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Operations Agent information from a Microsoft Fabric workspace by OperationsAgentId or OperationsAgentName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Operations Agent(s).
    If neither OperationsAgentId nor OperationsAgentName is specified, returns all Operations Agent items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Operations Agent item(s). This parameter is required.

.PARAMETER OperationsAgentId
    The unique identifier of the Operations Agent item to retrieve. Optional; specify either OperationsAgentId or OperationsAgentName, not both.

.PARAMETER OperationsAgentName
    The display name of the Operations Agent item to retrieve. Optional; specify either OperationsAgentId or OperationsAgentName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricOperationsAgent -WorkspaceId "workspace-12345" -OperationsAgentId "OperationsAgent-67890"
    Retrieves the Operations Agent with ID "OperationsAgent-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricOperationsAgent -WorkspaceId "workspace-12345" -OperationsAgentName "My Operations Agent"
    Retrieves the Operations Agent named "My Operations Agent" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricOperationsAgent -WorkspaceId "workspace-12345"
    Retrieves all Operations Agent items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricOperationsAgent -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Operations Agent items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricOperationsAgent {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$OperationsAgentName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'OperationsAgents'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $OperationsAgentId -DisplayName $OperationsAgentName -ResourceType 'Operations Agent' -TypeName 'MicrosoftFabric.OperationsAgent' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Operations Agent for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
