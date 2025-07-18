<#
.SYNOPSIS
    Updates an existing ML Model in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing ML Model 
    in the specified workspace. It supports optional parameters for ML Model description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Model exists. This parameter is optional.

.PARAMETER MLModelId
    The unique identifier of the ML Model to be updated. This parameter is mandatory.

.PARAMETER MLModelDescription
    New description for the ML Model.

.EXAMPLE
    Update-FabricMLModel -WorkspaceId "workspace-12345" -MLModelId "model-67890" -MLModelName "Updated ML Model" -MLModelDescription "Updated description"
    This example updates the ML Model with ID "model-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricMLModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MLModelId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            description = $MLModelDescription
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
        Write-Message -Message "ML Model '$MLModelId' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update ML Model. Error: $errorDetails" -Level Error
    }
}
