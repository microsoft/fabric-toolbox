<#
.SYNOPSIS
    Retrieves SemanticModel details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves SemanticModel details from a specified workspace using either the provided SemanticModelId or SemanticModelName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is mandatory.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to retrieve. This parameter is optional.

.PARAMETER SemanticModelName
    The name of the SemanticModel to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890"
    This example retrieves the SemanticModel details for the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelName "My SemanticModel"
    This example retrieves the SemanticModel details for the SemanticModel named "My SemanticModel" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSemanticModel {
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
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName
    )
    try {
        # Validate input parameters
        if ($SemanticModelId -and $SemanticModelName) {
            Write-FabricLog -Message "Specify only one parameter: either 'SemanticModelId' or 'SemanticModelName'." -Level Error
            return $null
        }

        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SemanticModelId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $SemanticModelId }, 'First')
        }
        elseif ($SemanticModelName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $SemanticModelName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            # Add type decoration for custom formatting
            $matchedItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.SemanticModel'
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SemanticModel. Error: $errorDetails" -Level Error
    }

}
