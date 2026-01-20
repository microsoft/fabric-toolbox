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

.PARAMETER Raw
    When specified, returns the raw API response without any filtering or formatting.

.EXAMPLE
    Get-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890"
    This example retrieves the SemanticModel details for the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelName "My SemanticModel"
    This example retrieves the SemanticModel details for the SemanticModel named "My SemanticModel" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSemanticModel -WorkspaceId "workspace-12345" -Raw
    This example returns the raw API response for all semantic models in the workspace without any processing.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSemanticModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($SemanticModelId -and $SemanticModelName) {
                Write-FabricLog -Message "Specify only one parameter: either 'SemanticModelId' or 'SemanticModelName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/semanticModels" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $SemanticModelId -DisplayName $SemanticModelName -ResourceType 'SemanticModel' -TypeName 'MicrosoftFabric.SemanticModel' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve SemanticModel for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
