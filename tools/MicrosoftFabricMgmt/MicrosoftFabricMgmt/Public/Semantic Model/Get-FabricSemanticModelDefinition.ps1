<#
.SYNOPSIS
    Retrieves the definition of an SemanticModel from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an SemanticModel from a specified workspace using the provided SemanticModelId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is mandatory.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to retrieve the definition for. This parameter is optional.

.PARAMETER SemanticModelFormat
    The format in which to retrieve the SemanticModel definition. This parameter is optional.

.EXAMPLE
    Get-FabricSemanticModelDefinition -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890"
    This example retrieves the definition of the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSemanticModelDefinition -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelFormat "json"
    This example retrieves the definition of the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricSemanticModelDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('TMDL', 'TMSL')]
        [string]$SemanticModelFormat = "TMDL"
    )
    try { 
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic 
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId
        if ($SemanticModelFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $SemanticModelFormat
        }   
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "SemanticModel '$SemanticModelId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve SemanticModel. Error: $errorDetails" -Level Error
    } 
 
}
