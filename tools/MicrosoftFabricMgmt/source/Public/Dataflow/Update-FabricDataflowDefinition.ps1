<#
.SYNOPSIS
    Updates the definition of a Dataflow in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition of a Dataflow.
    This is a long-running operation (LRO).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Dataflow.

.PARAMETER DataflowId
    The unique identifier of the Dataflow.

.PARAMETER Definition
    The new definition for the Dataflow as a hashtable containing the parts.

.EXAMPLE
    $definition = @{
        parts = @(
            @{
                path = "dataflow.json"
                payload = "base64encodedcontent"
                payloadType = "InlineBase64"
            }
        )
    }
    Update-FabricDataflowDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Definition $definition

    Updates the Dataflow's definition.

.NOTES
    - This operation is a long-running operation (LRO).
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Update-FabricDataflowDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataflowId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition
    )

    try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows' -ItemId "$DataflowId/updateDefinition"
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = $Definition
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess($DataflowId, "Update Dataflow definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Dataflow definition updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Dataflow definition. Error: $errorDetails" -Level Error
    }
}
