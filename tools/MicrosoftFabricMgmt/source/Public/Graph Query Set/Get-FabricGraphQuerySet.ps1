<#
.SYNOPSIS
    Retrieves details of one or more Graph Query Set items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Graph Query Set information from a Microsoft Fabric workspace by GraphQuerySetId or GraphQuerySetName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Graph Query Set(s).
    If neither GraphQuerySetId nor GraphQuerySetName is specified, returns all Graph Query Set items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Graph Query Set item(s). This parameter is required.

.PARAMETER GraphQuerySetId
    The unique identifier of the Graph Query Set item to retrieve. Optional; specify either GraphQuerySetId or GraphQuerySetName, not both.

.PARAMETER GraphQuerySetName
    The display name of the Graph Query Set item to retrieve. Optional; specify either GraphQuerySetId or GraphQuerySetName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricGraphQuerySet -WorkspaceId "workspace-12345" -GraphQuerySetId "GraphQuerySet-67890"
    Retrieves the Graph Query Set with ID "GraphQuerySet-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricGraphQuerySet -WorkspaceId "workspace-12345" -GraphQuerySetName "My Graph Query Set"
    Retrieves the Graph Query Set named "My Graph Query Set" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricGraphQuerySet -WorkspaceId "workspace-12345"
    Retrieves all Graph Query Set items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricGraphQuerySet -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Graph Query Set items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricGraphQuerySet {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQuerySetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQuerySetName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphQuerySets'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $GraphQuerySetId -DisplayName $GraphQuerySetName -ResourceType 'Graph Query Set' -TypeName 'MicrosoftFabric.GraphQuerySet' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Graph Query Set for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
