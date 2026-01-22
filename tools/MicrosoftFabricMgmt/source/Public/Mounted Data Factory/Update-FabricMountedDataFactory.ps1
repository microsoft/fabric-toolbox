<#
.SYNOPSIS
    Updates the name and optionally the description of a Mounted Data Factory in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the display name and, if provided, the description of a specified Mounted Data Factory within a workspace.

.PARAMETER WorkspaceId
    The ID of the workspace containing the Mounted Data Factory.

.PARAMETER MountedDataFactoryId
    The ID of the Mounted Data Factory to update.

.PARAMETER MountedDataFactoryName
    The new display name for the Mounted Data Factory.

.PARAMETER MountedDataFactoryDescription
    (Optional) The new description for the Mounted Data Factory.

.EXAMPLE
    Update-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryId "mdf-67890" -MountedDataFactoryName "New Name" -MountedDataFactoryDescription "New description"
    Updates the specified Mounted Data Factory with a new name and description.

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function Update-FabricMountedDataFactory {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$MountedDataFactoryName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$MountedDataFactoryDescription
    )
    try {
        # Validate that at least one update parameter is provided
        if (-not $MountedDataFactoryName -and -not $MountedDataFactoryDescription) {
            Write-FabricLog -Message "At least one of MountedDataFactoryName or MountedDataFactoryDescription must be specified" -Level Error
            return
        }

        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'mountedDataFactories' -ItemId $MountedDataFactoryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($MountedDataFactoryName) {
            $body.displayName = $MountedDataFactoryName
        }

        if ($MountedDataFactoryDescription) {
            $body.description = $MountedDataFactoryDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Mounted Data Factory '$MountedDataFactoryId' in workspace '$WorkspaceId'"
        $action = "Update Mounted Data Factory display name/description"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mounted Data Factory '$MountedDataFactoryName' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}
