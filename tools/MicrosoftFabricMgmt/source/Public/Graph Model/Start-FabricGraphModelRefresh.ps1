<#
.SYNOPSIS
    Runs an on-demand RefreshGraph job for a Graph Model.

.DESCRIPTION
    The Start-FabricGraphModelRefresh cmdlet triggers an on-demand RefreshGraph job for the specified
    Graph Model in a Fabric workspace.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Graph Model.

.PARAMETER GraphModelId
    The GUID of the Graph Model to refresh.

.EXAMPLE
    Start-FabricGraphModelRefresh -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Starts a refresh job for the specified Graph Model.

.EXAMPLE
    Get-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelName "MyGraphModel" | Start-FabricGraphModelRefresh -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Starts a refresh job by piping from Get-FabricGraphModel.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This is an asynchronous operation that returns immediately.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Start-FabricGraphModelRefresh {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
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
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphModels' -ItemId "$GraphModelId/jobs/RefreshGraph/instances"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Graph Model '$GraphModelId'", "Start RefreshGraph job")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "RefreshGraph job started for Graph Model '$GraphModelId'." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to start RefreshGraph job for Graph Model '$GraphModelId'. Error: $errorDetails" -Level Error
        }
    }
}
