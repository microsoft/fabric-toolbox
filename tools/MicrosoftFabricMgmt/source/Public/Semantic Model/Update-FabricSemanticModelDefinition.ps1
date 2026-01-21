<#
.SYNOPSIS
    Updates the definition of an existing SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing SemanticModel
    in the specified workspace. It supports optional parameters for SemanticModel definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is mandatory.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be updated. This parameter is mandatory.

.PARAMETER SemanticModelPathDefinition
    An optional path to the SemanticModel definition file to upload.

.EXAMPLE
    Update-FabricSemanticModelDefinition -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelPathDefinition "C:\Path\To\SemanticModelDefinition.json"
    This example updates the definition of the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricSemanticModelDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelPathDefinition
    )
    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI with filtering logic
            $apiEndpointURI = "{0}/workspaces/{1}/SemanticModels/{2}/updateDefinition" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $SemanticModelId

            # Construct the request body
            $body = @{
                definition = @{
                    parts = @()
                }
            }

            $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $SemanticModelPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
            # Check if any path is .platform
            foreach ($part in $jsonObjectParts.parts) {
                if ($part.path -eq ".platform") {
                    $hasPlatformFile = $true
                    Write-FabricLog -Message "Platform File: $hasPlatformFile" -Level Debug
                }
            }

            # If the platform file exists, append the query parameter to the URL
            if ($hasPlatformFile -eq $true) {
                $apiEndpointURI = "?updateMetadata=true" -f $apiEndpointURI
            }
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Convert the body to JSON
            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Make the API request
            if ($PSCmdlet.ShouldProcess("Semantic Model definition '$SemanticModelId' in workspace '$WorkspaceId'", "Update")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method = 'Post'
                    Body = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                # Return the API response
                Write-FabricLog -Message "Successfully updated the definition for Semantic Model with ID '$SemanticModelId' in workspace '$WorkspaceId'." -Level Host
                return $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update SemanticModel. Error: $errorDetails" -Level Error
        }
    }
}
