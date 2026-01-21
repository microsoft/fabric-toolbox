<#
.SYNOPSIS
    Updates an existing SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing SemanticModel
    in the specified workspace. It supports optional parameters for SemanticModel description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is optional.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be updated. This parameter is mandatory.

.PARAMETER SemanticModelName
    The new name of the SemanticModel. This parameter is mandatory.

.PARAMETER SemanticModelDescription
    An optional new description for the SemanticModel.

.EXAMPLE
    Update-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelName "Updated SemanticModel" -SemanticModelDescription "Updated description"
    This example updates the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricSemanticModel {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$SemanticModelName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$SemanticModelDescription
    )
    process {
        try {
            # Validate that at least one update parameter is provided
            if (-not $SemanticModelName -and -not $SemanticModelDescription) {
                Write-FabricLog -Message "At least one of SemanticModelName or SemanticModelDescription must be specified" -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'semanticModels' -ItemId $SemanticModelId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body
            $body = @{}

            if ($SemanticModelName) {
                $body.displayName = $SemanticModelName
            }

            if ($SemanticModelDescription) {
                $body.description = $SemanticModelDescription
            }

            # Convert the body to JSON
            $bodyJson = $body | ConvertTo-Json
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Make the API request
            if ($PSCmdlet.ShouldProcess("Semantic Model '$SemanticModelName' in workspace '$WorkspaceId'", "Update")) {
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Patch'
                    Body = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                # Return the API response
                Write-FabricLog -Message "SemanticModel '$SemanticModelName' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update SemanticModel. Error: $errorDetails" -Level Error
        }
    }
}
