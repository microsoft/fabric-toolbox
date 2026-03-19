<#
.SYNOPSIS
    Retrieves details of one or more Ontology items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Ontology information from a Microsoft Fabric workspace by OntologyId or OntologyName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Ontology(s).
    If neither OntologyId nor OntologyName is specified, returns all Ontology items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Ontology item(s). This parameter is required.

.PARAMETER OntologyId
    The unique identifier of the Ontology item to retrieve. Optional; specify either OntologyId or OntologyName, not both.

.PARAMETER OntologyName
    The display name of the Ontology item to retrieve. Optional; specify either OntologyId or OntologyName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricOntology -WorkspaceId "workspace-12345" -OntologyId "Ontology-67890"
    Retrieves the Ontology with ID "Ontology-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricOntology -WorkspaceId "workspace-12345" -OntologyName "My Ontology"
    Retrieves the Ontology named "My Ontology" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricOntology -WorkspaceId "workspace-12345"
    Retrieves all Ontology items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricOntology -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Ontology items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricOntology {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OntologyId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$OntologyName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ontologies'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $OntologyId -DisplayName $OntologyName -ResourceType 'Ontology' -TypeName 'MicrosoftFabric.Ontology' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Ontology for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
