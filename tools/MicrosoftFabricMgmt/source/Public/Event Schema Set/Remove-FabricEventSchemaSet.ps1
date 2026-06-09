<#
.SYNOPSIS
    Deletes a Event Schema Set item from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Event Schema Set item
    from the specified workspace using the provided WorkspaceId and EventSchemaSetId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Event Schema Set item to be deleted.

.PARAMETER EventSchemaSetId
    The unique identifier of the Event Schema Set item to delete.

.EXAMPLE
    Remove-FabricEventSchemaSet -WorkspaceId "workspace-12345" -EventSchemaSetId "-67890"
    Deletes the Event Schema Set item with ID "-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Remove-FabricEventSchemaSet {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$EventSchemaSetId
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventSchemaSets' -ItemId $EventSchemaSetId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Event Schema Set '$EventSchemaSetId' in workspace '$WorkspaceId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Event Schema Set '$EventSchemaSetId' deleted successfully from workspace '$WorkspaceId'." -Level Host
                $response
            }
        }
        catch {
            # Log and handle errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Event Schema Set '$EventSchemaSetId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
