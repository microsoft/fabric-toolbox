<#
.SYNOPSIS
    Retrieves Reflex details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Reflex details from a specified workspace using either the provided ReflexId or ReflexName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is mandatory.

.PARAMETER ReflexId
    The unique identifier of the Reflex to retrieve. This parameter is optional.

.PARAMETER ReflexName
    The name of the Reflex to retrieve. This parameter is optional.

.PARAMETER Raw
    If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
    Get-FabricReflex -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890"
    This example retrieves the Reflex details for the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReflex -WorkspaceId "workspace-12345" -ReflexName "My Reflex"
    This example retrieves the Reflex details for the Reflex named "My Reflex" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReflex -WorkspaceId "workspace-12345" -Raw
    This example retrieves all Reflexes in the workspace with raw API response format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricReflex {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReflexName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($ReflexId -and $ReflexName) {
                Write-FabricLog -Message "Specify only one parameter: either 'ReflexId' or 'ReflexName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/reflexes" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $ReflexId -DisplayName $ReflexName -ResourceType 'Reflex' -TypeName 'MicrosoftFabric.Reflex' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Reflex for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
