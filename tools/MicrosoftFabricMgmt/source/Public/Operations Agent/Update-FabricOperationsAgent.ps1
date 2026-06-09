<#
.SYNOPSIS
    Updates the properties of a Operations Agent item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a PATCH operation on the Microsoft Fabric API to update a Operations Agent item's
    properties in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Operations Agent item to be updated.

.PARAMETER OperationsAgentId
    The unique identifier of the Operations Agent item to update.

.PARAMETER OperationsAgentDescription
    The new description for the Operations Agent item.

.PARAMETER OperationsAgentDisplayName
    The new display name for the Operations Agent item.

.EXAMPLE
    Update-FabricOperationsAgent -WorkspaceId "workspace-12345" -OperationsAgentId "-67890" -OperationsAgentDescription "Updated description"

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Update-FabricOperationsAgent {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$OperationsAgentId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OperationsAgentDisplayName
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'OperationsAgents' -ItemId $OperationsAgentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body with only provided parameters
        $body = @{}

        if ($OperationsAgentDisplayName) {
            $body.displayName = $OperationsAgentDisplayName
        }

        if ($OperationsAgentDescription) {
            $body.description = $OperationsAgentDescription
        }

        # Only proceed if there are updates to apply
        if ($body.Count -eq 0) {
            Write-FabricLog -Message "No updates specified for Operations Agent '$OperationsAgentId'." -Level Warning
            return
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Operations Agent '$OperationsAgentId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Operations Agent '$OperationsAgentId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Operations Agent '$OperationsAgentId'. Error: $errorDetails" -Level Error
    }
}
