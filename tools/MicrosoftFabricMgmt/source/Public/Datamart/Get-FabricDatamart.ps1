<#
.SYNOPSIS
    Retrieves datamarts from a specified workspace.

.DESCRIPTION
    This function retrieves all datamarts from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve datamarts. This parameter is mandatory.

.PARAMETER DatamartId
    Optional. The GUID of the datamart to retrieve. Provide this when you want to fetch a single, specific datamart by its identifier.

.PARAMETER DatamartName
    Optional. The display name of the datamart to retrieve. Use this to fetch a single datamart by name when the Id is not known.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
     Get-FabricDatamart -WorkspaceId "12345"
    This example retrieves all datamarts from the workspace with ID "12345".

.EXAMPLE
    Get-FabricDatamart -WorkspaceId "12345" -Raw
    Returns the raw API response for all datamarts in the workspace without any formatting or type decoration.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricDatamart {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DatamartId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DatamartName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'datamarts')

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $DatamartId -DisplayName $DatamartName -ResourceType 'Datamart' -TypeName 'MicrosoftFabric.Datamart' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Datamart for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
