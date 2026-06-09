<#
.SYNOPSIS
    Updates an existing Graph Model in a Fabric workspace.

.DESCRIPTION
    The Update-FabricGraphModel cmdlet updates the properties of a Graph Model in a specified workspace.
    You can update the display name and/or description.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model.

.PARAMETER GraphModelId
    The GUID of the Graph Model to update.

.PARAMETER GraphModelName
    Optional. The new display name for the Graph Model.

.PARAMETER Description
    Optional. The new description for the Graph Model.

.EXAMPLE
    Update-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -GraphModelName "NewName"

    Updates the display name of the specified Graph Model.

.EXAMPLE
    Update-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Description "Updated description"

    Updates the description of the specified Graph Model.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricGraphModel {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GraphModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description
    )

    process {
        try {
            if (-not $GraphModelName -and -not $Description) {
                Write-FabricLog -Message "At least one of 'GraphModelName' or 'Description' must be specified." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphModels' -ItemId $GraphModelId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{}

            if ($GraphModelName) {
                $body.displayName = $GraphModelName
            }

            if ($Description) {
                $body.description = $Description
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Graph Model '$GraphModelId'", "Update")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Patch'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    Write-FabricLog -Message "Graph Model '$GraphModelId' updated successfully." -Level Debug
                    return $response
                }
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Graph Model '$GraphModelId'. Error: $errorDetails" -Level Error
        }
    }
}
