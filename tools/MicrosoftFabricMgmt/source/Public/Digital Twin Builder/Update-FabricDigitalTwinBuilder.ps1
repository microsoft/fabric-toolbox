<#
.SYNOPSIS
    Updates the properties of a Digital Twin Builder item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a PATCH operation on the Microsoft Fabric API to update a Digital Twin Builder item's
    properties in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Digital Twin Builder item to be updated.

.PARAMETER DigitalTwinBuilderId
    The unique identifier of the Digital Twin Builder item to update.

.PARAMETER DigitalTwinBuilderDescription
    The new description for the Digital Twin Builder item.

.PARAMETER DigitalTwinBuilderDisplayName
    The new display name for the Digital Twin Builder item.

.EXAMPLE
    Update-FabricDigitalTwinBuilder -WorkspaceId "workspace-12345" -DigitalTwinBuilderId "-67890" -DigitalTwinBuilderDescription "Updated description"

.NOTES
    - Requires the $FabricConfig global configuration, which must include BaseUrl and FabricHeaders.
    - Ensures token validity by invoking Invoke-FabricAuthCheck before making the API request.

#>
function Update-FabricDigitalTwinBuilder {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DigitalTwinBuilderId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DigitalTwinBuilderDisplayName
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'digitaltwinbuilders' -ItemId $DigitalTwinBuilderId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body with only provided parameters
        $body = @{}

        if ($DigitalTwinBuilderDisplayName) {
            $body.displayName = $DigitalTwinBuilderDisplayName
        }

        if ($DigitalTwinBuilderDescription) {
            $body.description = $DigitalTwinBuilderDescription
        }

        # Only proceed if there are updates to apply
        if ($body.Count -eq 0) {
            Write-FabricLog -Message "No updates specified for Digital Twin Builder '$DigitalTwinBuilderId'." -Level Warning
            return
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update Digital Twin Builder '$DigitalTwinBuilderId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Digital Twin Builder '$DigitalTwinBuilderId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Digital Twin Builder '$DigitalTwinBuilderId'. Error: $errorDetails" -Level Error
    }
}
