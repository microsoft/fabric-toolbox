<#
.SYNOPSIS
Updates the properties of a Fabric Eventstream.

.DESCRIPTION
The `Update-FabricEventstream` function updates the name and/or description of a specified Fabric Eventstream by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Eventstream to update. Required to scope the API request.

.PARAMETER EventstreamId
The unique identifier of the Eventstream to be updated.

.PARAMETER EventstreamName
The new name for the Eventstream.

.PARAMETER EventstreamDescription
(Optional) The new description for the Eventstream.

.EXAMPLE
Update-FabricEventstream -EventstreamId "Eventstream123" -EventstreamName "NewEventstreamName"

Updates the name of the Eventstream with the ID "Eventstream123" to "NewEventstreamName".

.EXAMPLE
Update-FabricEventstream -EventstreamId "Eventstream123" -EventstreamName "NewName" -EventstreamDescription "Updated description"

Updates both the name and description of the Eventstream "Eventstream123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$EventstreamId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$EventstreamName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$EventstreamDescription
    )

    process {
        try {
        # Validate that at least one update parameter is provided
        if (-not $EventstreamName -and -not $EventstreamDescription) {
            Write-FabricLog -Message "At least one of EventstreamName or EventstreamDescription must be specified" -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventstreams' -ItemId $EventstreamId

        # Construct the request body
        $body = @{}

        if ($EventstreamName) {
            $body.displayName = $EventstreamName
        }

        if ($EventstreamDescription) {
            $body.description = $EventstreamDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Update Eventstream '$EventstreamName' in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamName' updated successfully!" -Level Host
            $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Eventstream. Error: $errorDetails" -Level Error
        }
    }
}
