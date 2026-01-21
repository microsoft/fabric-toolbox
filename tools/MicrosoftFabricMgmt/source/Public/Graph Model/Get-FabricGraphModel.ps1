<#
.SYNOPSIS
    Gets a Graph Model or lists all Graph Models in a workspace.

.DESCRIPTION
    The Get-FabricGraphModel cmdlet retrieves Graph Model items from a specified Microsoft Fabric workspace.
    You can list all Graph Models or filter by a specific GraphModelId or display name.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model resources.

.PARAMETER GraphModelId
    Optional. Returns only the Graph Model matching this resource Id.

.PARAMETER GraphModelName
    Optional. Returns only the Graph Model whose display name exactly matches this value.

.PARAMETER Raw
    Optional. When specified, returns the raw API response with resolved CapacityName and WorkspaceName
    properties added directly to the output objects.

.EXAMPLE
    Get-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all Graph Models in the specified workspace.

.EXAMPLE
    Get-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the Graph Model with the specified Id.

.EXAMPLE
    Get-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelName "MyGraphModel"

    Returns the Graph Model with the specified name.

.EXAMPLE
    Get-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -Raw | Export-Csv -Path "graphmodels.csv"

    Exports all Graph Models with resolved names to a CSV file.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricGraphModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphModelName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($GraphModelId -and $GraphModelName) {
                Write-FabricLog -Message "Specify only one parameter: either 'GraphModelId' or 'GraphModelName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphModels'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $GraphModelId -DisplayName $GraphModelName -ResourceType 'GraphModel' -TypeName 'MicrosoftFabric.GraphModel' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Graph Model for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
