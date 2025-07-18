<#
.SYNOPSIS
    Updates an existing SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing SemanticModel 
    in the specified workspace. It supports optional parameters for SemanticModel description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is optional.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be updated. This parameter is mandatory.

.PARAMETER SemanticModelName
    The new name of the SemanticModel. This parameter is mandatory.

.PARAMETER SemanticModelDescription
    An optional new description for the SemanticModel.

.EXAMPLE
    Update-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelName "Updated SemanticModel" -SemanticModelDescription "Updated description"
    This example updates the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricSemanticModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelDescription
    )
    try { 
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $SemanticModelName
        }

        if ($SemanticModelDescription) {
            $body.description = $SemanticModelDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 
      
        # Return the API response
        Write-Message -Message "SemanticModel '$SemanticModelName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update SemanticModel. Error: $errorDetails" -Level Error
    }
}
