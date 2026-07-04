<#
.SYNOPSIS
    Creates a new SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new SemanticModel
    in the specified workspace. It supports optional parameters for SemanticModel description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel will be created. This parameter is mandatory.

.PARAMETER SemanticModelName
    The name of the SemanticModel to be created. This parameter is mandatory.

.PARAMETER SemanticModelDescription
    An optional description for the SemanticModel.

.PARAMETER SemanticModelPathDefinition
    An optional path to the SemanticModel definition file to upload.

.PARAMETER FolderId
    Optional. The folder ID where the SemanticModel will be placed. If omitted, the SemanticModel is created in the workspace root.

.EXAMPLE
    New-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelName "New SemanticModel" -SemanticModelDescription "Description of the new SemanticModel"
    This example creates a new SemanticModel named "New SemanticModel" in the workspace with ID "workspace-12345" with the provided description.

.EXAMPLE
    New-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelName "New SemanticModel" -SemanticModelPathDefinition "C:\Definitions\Model" -FolderId "folder-67890"
    This example creates a new SemanticModel from the specified definition files and places it in the folder with ID "folder-67890".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricSemanticModel {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelDescription,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'semanticModels'

        # Construct the request body
        $body = @{
            displayName = $SemanticModelName
            definition  = @{
                parts = @()
            }
        }

        if ($FolderId) {
            $body.folderId = $FolderId
        }

        # As Report has multiple parts, we need to get the definition parts
        $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $SemanticModelPathDefinition
        # Add new part to the parts array
        $body.definition.parts = $jsonObjectParts.parts

        if ($SemanticModelDescription) {
            $body.description = $SemanticModelDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Semantic Model '$SemanticModelName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "SemanticModel '$SemanticModelName' created successfully!" -Level Host
            $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create SemanticModel. Error: $errorDetails" -Level Error
    }
}
