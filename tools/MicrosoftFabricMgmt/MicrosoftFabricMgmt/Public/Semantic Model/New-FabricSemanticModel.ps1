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

.EXAMPLE
    New-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelName "New SemanticModel" -SemanticModelDescription "Description of the new SemanticModel"
    This example creates a new SemanticModel named "New SemanticModel" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function New-FabricSemanticModel {
    [CmdletBinding()]
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
        [string]$SemanticModelPathDefinition
    )
    try { 
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Construct the request body
        $body = @{
            displayName = $SemanticModelName
            definition  = @{
                parts = @()
            }
        }

        # As Report has multiple parts, we need to get the definition parts  
        $jsonObjectParts = Get-FileDefinitionParts -sourceDirectory $SemanticModelPathDefinition
        # Add new part to the parts array
        $body.definition.parts = $jsonObjectParts.parts

        if ($SemanticModelDescription) {
            $body.description = $SemanticModelDescription
        }
        
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response   
        Write-Message -Message "SemanticModel '$SemanticModelName' created successfully!" -Level Info
        return $response
      
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create SemanticModel. Error: $errorDetails" -Level Error
    }
}
