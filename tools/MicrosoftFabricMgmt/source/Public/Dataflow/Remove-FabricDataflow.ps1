<#
.SYNOPSIS
    Removes a Dataflow from a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a Dataflow
    from the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Dataflow.

.PARAMETER DataflowId
    The unique identifier of the Dataflow to delete.

.EXAMPLE
    Remove-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Removes the specified Dataflow from the workspace.

.EXAMPLE
    Get-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowName "OldDataflow" | Remove-FabricDataflow

    Removes a Dataflow by piping it from Get-FabricDataflow.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Remove-FabricDataflow {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataflowId
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows' -ItemId $DataflowId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Delete'
            }

            if ($PSCmdlet.ShouldProcess($DataflowId, "Remove Dataflow from workspace '$WorkspaceId'")) {
                $null = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Dataflow '$DataflowId' removed successfully!" -Level Host
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove Dataflow. Error: $errorDetails" -Level Error
        }
    }
}
