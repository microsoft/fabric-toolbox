<#
.SYNOPSIS
    Deletes a Digital Twin Builder item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Digital Twin Builder item
    from the specified workspace using the provided WorkspaceId and DigitalTwinBuilderId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder item to be deleted.

.PARAMETER DigitalTwinBuilderId
    The unique identifier of the Digital Twin Builder item to delete.

.EXAMPLE
    Remove-FabricDigitalTwinBuilder -WorkspaceId "workspace-12345" -DigitalTwinBuilderId "-67890"
    Deletes the Digital Twin Builder item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricDigitalTwinBuilder {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DigitalTwinBuilderId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'digitaltwinbuilders' -ItemId $DigitalTwinBuilderId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Digital Twin Builder '$DigitalTwinBuilderId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Digital Twin Builder '$DigitalTwinBuilderId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Digital Twin Builder '$DigitalTwinBuilderId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
