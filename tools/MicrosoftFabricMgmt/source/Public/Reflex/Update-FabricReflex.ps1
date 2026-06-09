<#
.SYNOPSIS
    Updates an existing Reflex in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Reflex
    in the specified workspace. It supports optional parameters for Reflex description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is optional.

.PARAMETER ReflexId
    The unique identifier of the Reflex to be updated. This parameter is mandatory.

.PARAMETER ReflexName
    The new name of the Reflex. This parameter is mandatory.

.PARAMETER ReflexDescription
    An optional new description for the Reflex.

.EXAMPLE
    Update-FabricReflex -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890" -ReflexName "Updated Reflex" -ReflexDescription "Updated description"
    This example updates the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricReflex {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ReflexId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$ReflexName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$ReflexDescription
    )
    process {
        try {
            # Validate that at least one update parameter is provided
            if (-not $ReflexName -and -not $ReflexDescription) {
                Write-FabricLog -Message "At least one of ReflexName or ReflexDescription must be specified" -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'reflexes' -ItemId $ReflexId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($ReflexName) {
            $body.displayName = $ReflexName
        }

        if ($ReflexDescription) {
            $body.description = $ReflexDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Reflex '$ReflexName' (ID: $ReflexId) in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Reflex '$ReflexName' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Reflex. Error: $errorDetails" -Level Error
        }
    }
}
