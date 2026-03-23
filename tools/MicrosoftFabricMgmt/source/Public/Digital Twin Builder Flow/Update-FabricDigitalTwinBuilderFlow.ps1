<#
.SYNOPSIS
    Updates the properties of a Digital Twin Builder Flow item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a PATCH operation on the Microsoft Fabric API to update a Digital Twin Builder Flow item's
    properties in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder Flow item to be updated.

.PARAMETER DigitalTwinBuilderFlowId
    The unique identifier of the Digital Twin Builder Flow item to update.

.PARAMETER DigitalTwinBuilderFlowDescription
    The new description for the Digital Twin Builder Flow item.

.PARAMETER DigitalTwinBuilderFlowDisplayName
    The new display name for the Digital Twin Builder Flow item.

.EXAMPLE
    Update-FabricDigitalTwinBuilderFlow -WorkspaceId "workspace-12345" -DigitalTwinBuilderFlowId "-67890" -DigitalTwinBuilderFlowDescription "Updated description"

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Update-FabricDigitalTwinBuilderFlow {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DigitalTwinBuilderFlowId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderFlowDisplayName
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'digitaltwinbuilderflows' -ItemId $DigitalTwinBuilderFlowId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body with only provided parameters
        $body = @{}

        if ($DigitalTwinBuilderFlowDisplayName) {
            $body.displayName = $DigitalTwinBuilderFlowDisplayName
        }

        if ($DigitalTwinBuilderFlowDescription) {
            $body.description = $DigitalTwinBuilderFlowDescription
        }

        # Only proceed if there are updates to apply
        if ($body.Count -eq 0) {
            Write-FabricLog -Message "No updates specified for Digital Twin Builder Flow '$DigitalTwinBuilderFlowId'." -Level Warning
            return
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Digital Twin Builder Flow '$DigitalTwinBuilderFlowId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Digital Twin Builder Flow '$DigitalTwinBuilderFlowId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Digital Twin Builder Flow '$DigitalTwinBuilderFlowId'. Error: $errorDetails" -Level Error
    }
}
