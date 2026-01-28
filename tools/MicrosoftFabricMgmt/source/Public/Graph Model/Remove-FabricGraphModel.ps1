<#
.SYNOPSIS
    Removes a Graph Model from a Fabric workspace.

.DESCRIPTION
    The Remove-FabricGraphModel cmdlet deletes a Graph Model from a specified workspace.
    This is a destructive operation and cannot be undone.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model.

.PARAMETER GraphModelId
    The GUID of the Graph Model to delete.

.EXAMPLE
    Remove-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Deletes the specified Graph Model from the workspace.

.EXAMPLE
    Get-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelName "OldGraphModel" | Remove-FabricGraphModel

    Deletes a Graph Model by piping from Get-FabricGraphModel.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Remove-FabricGraphModel {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$GraphModelId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphModels' -ItemId $GraphModelId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Graph Model '$GraphModelId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Delete'
                }
                Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Graph Model '$GraphModelId' deleted successfully." -Level Debug
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Graph Model '$GraphModelId'. Error: $errorDetails" -Level Error
        }
    }
}
