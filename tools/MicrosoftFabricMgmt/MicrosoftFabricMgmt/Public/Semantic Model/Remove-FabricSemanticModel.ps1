<#
.SYNOPSIS
    Removes an SemanticModel from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an SemanticModel 
    from the specified workspace using the provided WorkspaceId and SemanticModelId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the SemanticModel will be removed.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be removed.

.EXAMPLE
    Remove-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890"
    This example removes the SemanticModel with ID "SemanticModel-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Remove-FabricSemanticModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        ## Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "SemanticModel '$SemanticModelId' deleted successfully from workspace '$WorkspaceId'." -Level Info  
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete SemanticModel '$SemanticModelId'. Error: $errorDetails" -Level Error
    }
}
