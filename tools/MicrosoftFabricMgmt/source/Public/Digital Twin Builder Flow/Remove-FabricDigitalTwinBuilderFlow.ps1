<#
.SYNOPSIS
    Deletes a Digital Twin Builder Flow item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Digital Twin Builder Flow item
    from the specified workspace using the provided WorkspaceId and DigitalTwinBuilderFlowId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder Flow item to be deleted.

.PARAMETER DigitalTwinBuilderFlowId
    The unique identifier of the Digital Twin Builder Flow item to delete.

.EXAMPLE
    Remove-FabricDigitalTwinBuilderFlow -WorkspaceId "workspace-12345" -DigitalTwinBuilderFlowId "-67890"
    Deletes the Digital Twin Builder Flow item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricDigitalTwinBuilderFlow {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DigitalTwinBuilderFlowId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'DigitalTwinBuilderFlows' -ItemId $DigitalTwinBuilderFlowId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Digital Twin Builder Flow '$DigitalTwinBuilderFlowId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Digital Twin Builder Flow '$DigitalTwinBuilderFlowId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Digital Twin Builder Flow '$DigitalTwinBuilderFlowId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
