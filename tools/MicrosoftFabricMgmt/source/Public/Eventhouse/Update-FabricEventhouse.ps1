<#
.SYNOPSIS
    Updates an existing Eventhouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Eventhouse
    in the specified workspace. It supports optional parameters for Eventhouse description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is optional.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to be updated. This parameter is mandatory.

.PARAMETER EventhouseName
    The new name of the Eventhouse. This parameter is mandatory.

.PARAMETER EventhouseDescription
    An optional new description for the Eventhouse.

.EXAMPLE
     Update-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890" -EventhouseName "Updated Eventhouse" -EventhouseDescription "Updated description"
    This example updates the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricEventhouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$EventhouseId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$EventhouseName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$EventhouseDescription
    )
    process {
        try {
        # Validate that at least one update parameter is provided
        if (-not $EventhouseName -and -not $EventhouseDescription) {
            Write-FabricLog -Message "At least one of EventhouseName or EventhouseDescription must be specified" -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventhouses' -ItemId $EventhouseId

        # Construct the request body
        $body = @{}

        if ($EventhouseName) {
            $body.displayName = $EventhouseName
        }

        if ($EventhouseDescription) {
            $body.description = $EventhouseDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        if ($PSCmdlet.ShouldProcess($EventhouseId, "Update Eventhouse '$EventhouseName' in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventhouse '$EventhouseName' updated successfully!" -Level Host
            $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Eventhouse. Error: $errorDetails" -Level Error
        }
    }
}
