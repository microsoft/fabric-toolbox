<#
.SYNOPSIS
    Gets the definition of a Dataflow from a Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of a Dataflow. This is a long-running operation (LRO)
    that returns the Dataflow's definition including its parts.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Dataflow.

.PARAMETER DataflowId
    The unique identifier of the Dataflow.

.EXAMPLE
    Get-FabricDataflowDefinition -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Gets the definition of the specified Dataflow.

.NOTES
    - This operation is a long-running operation (LRO).
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricDataflowDefinition {
    [CmdletBinding()]
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

            # Construct the API endpoint URI (POST to getDefinition)
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows' -ItemId "$DataflowId/getDefinition"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if (-not $response) {
                Write-FabricLog -Message "No definition returned from the API." -Level Warning
                return $null
            }

            Write-FabricLog -Message "Dataflow definition retrieved successfully." -Level Debug
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Dataflow definition. Error: $errorDetails" -Level Error
        }
    }
}
