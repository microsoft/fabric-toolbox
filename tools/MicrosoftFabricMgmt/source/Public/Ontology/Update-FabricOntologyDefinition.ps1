<#
.SYNOPSIS
    Updates the definition of a Ontology item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a Ontology item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Ontology item.

.PARAMETER OntologyId
    The unique identifier of the Ontology item to update.

.PARAMETER OntologyPathDefinition
    File path to the Ontology item definition JSON file to upload.

.PARAMETER OntologyPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricOntologyDefinition -WorkspaceId "workspace-12345" -OntologyId "-67890" -OntologyPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricOntologyDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$OntologyId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OntologyPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OntologyPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'ontologies', $OntologyId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($OntologyPathDefinition) {
            $OntologyEncodedContent = Convert-ToBase64 -filePath $OntologyPathDefinition

            if (-not [string]::IsNullOrEmpty($OntologyEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $OntologyEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Ontology definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($OntologyPathPlatformDefinition) {
            $OntologyEncodedPlatformContent = Convert-ToBase64 -filePath $OntologyPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($OntologyEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $OntologyEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Ontology Definition '$OntologyId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Ontology definition '$OntologyId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Ontology definition. Error: $errorDetails" -Level Error
    }
}
