<#
.SYNOPSIS
    Retrieves ML Model details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves ML Model details from a specified workspace using either the provided MLModelId or MLModelName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Model exists. This parameter is mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model to retrieve. This parameter is optional.

.PARAMETER MLModelName
    The name of the ML Model to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricMLModel -WorkspaceId "workspace-12345" -MLModelId "model-67890"
    This example retrieves the ML Model details for the model with ID "model-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricMLModel -WorkspaceId "workspace-12345" -MLModelName "My ML Model"
    This example retrieves the ML Model details for the model named "My ML Model" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricMLModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MLModelName
    )

    try {
        # Validate input parameters
        if ($MLModelId -and $MLModelName) {
            Write-Message -Message "Specify only one parameter: either 'MLModelId' or 'MLModelName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/mlModels" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
           
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MLModelId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MLModelId }, 'First')
        }
        elseif ($MLModelName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MLModelName }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve ML Model. Error: $errorDetails" -Level Error
    } 
 
}
