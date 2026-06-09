<#
.SYNOPSIS
Updates the properties of a Fabric Notebook.

.DESCRIPTION
The `Update-FabricNotebook` function updates the name and/or description of a specified Fabric Notebook by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Notebook to update. Required to scope the API request.

.PARAMETER NotebookId
The unique identifier of the Notebook to be updated.

.PARAMETER NotebookName
The new name for the Notebook.

.PARAMETER NotebookDescription
(Optional) The new description for the Notebook.

.EXAMPLE
Update-FabricNotebook -NotebookId "Notebook123" -NotebookName "NewNotebookName"

Updates the name of the Notebook with the ID "Notebook123" to "NewNotebookName".

.EXAMPLE
Update-FabricNotebook -NotebookId "Notebook123" -NotebookName "NewName" -NotebookDescription "Updated description"

Updates both the name and description of the Notebook "Notebook123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricNotebook {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$NotebookId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$NotebookName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$NotebookDescription
    )
    process {
    try {
        # Validate that at least one update parameter is provided
        if (-not $NotebookName -and -not $NotebookDescription) {
            Write-FabricLog -Message "At least one of NotebookName or NotebookDescription must be specified" -Level Error
            return
        }

        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'notebooks' -ItemId $NotebookId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($NotebookName) {
            $body.displayName = $NotebookName
        }

        if ($NotebookDescription) {
            $body.description = $NotebookDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

       # Make the API request when confirmed
        $target = "Notebook '$NotebookId' in workspace '$WorkspaceId'"
        $action = "Update Notebook display name/description"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Notebook '$NotebookName' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update notebook. Error: $errorDetails" -Level Error
    }
    }
}
