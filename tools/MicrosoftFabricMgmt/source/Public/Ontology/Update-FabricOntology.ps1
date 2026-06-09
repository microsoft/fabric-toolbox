<#
.SYNOPSIS
    Updates the properties of a Ontology item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a PATCH operation on the Microsoft Fabric API to update a Ontology item's
    properties in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Ontology item to be updated.

.PARAMETER OntologyId
    The unique identifier of the Ontology item to update.

.PARAMETER OntologyDescription
    The new description for the Ontology item.

.PARAMETER OntologyDisplayName
    The new display name for the Ontology item.

.EXAMPLE
    Update-FabricOntology -WorkspaceId "workspace-12345" -OntologyId "-67890" -OntologyDescription "Updated description"

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Update-FabricOntology {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$OntologyId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OntologyDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OntologyDisplayName
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ontologies' -ItemId $OntologyId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body with only provided parameters
        $body = @{}

        if ($OntologyDisplayName) {
            $body.displayName = $OntologyDisplayName
        }

        if ($OntologyDescription) {
            $body.description = $OntologyDescription
        }

        # Only proceed if there are updates to apply
        if ($body.Count -eq 0) {
            Write-FabricLog -Message "No updates specified for Ontology '$OntologyId'." -Level Warning
            return
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Ontology '$OntologyId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Ontology '$OntologyId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Ontology '$OntologyId'. Error: $errorDetails" -Level Error
    }
}
