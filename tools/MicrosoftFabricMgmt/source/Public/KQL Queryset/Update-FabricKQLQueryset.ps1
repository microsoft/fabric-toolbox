<#
.SYNOPSIS
Updates the properties of a Fabric KQLQueryset.

.DESCRIPTION
The `Update-FabricKQLQueryset` function updates the name and/or description of a specified Fabric KQLQueryset by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the KQL Queryset to update. Required to scope the API request.

.PARAMETER KQLQuerysetId
The unique identifier of the KQLQueryset to be updated.

.PARAMETER KQLQuerysetName
The new name for the KQLQueryset.

.PARAMETER KQLQuerysetDescription
(Optional) The new description for the KQLQueryset.

.EXAMPLE
Update-FabricKQLQueryset -KQLQuerysetId "KQLQueryset123" -KQLQuerysetName "NewKQLQuerysetName"

Updates the name of the KQLQueryset with the ID "KQLQueryset123" to "NewKQLQuerysetName".

.EXAMPLE
Update-FabricKQLQueryset -KQLQuerysetId "KQLQueryset123" -KQLQuerysetName "NewName" -KQLQuerysetDescription "Updated description"

Updates both the name and description of the KQLQueryset "KQLQueryset123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricKQLQueryset {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$KQLQuerysetName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$KQLQuerysetDescription
    )
    process {
        try {
        # Validate that at least one update parameter is provided
        if (-not $KQLQuerysetName -and -not $KQLQuerysetDescription) {
            Write-FabricLog -Message "At least one of KQLQuerysetName or KQLQuerysetDescription must be specified" -Level Error
            return
        }

        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'kqlQuerysets' -ItemId $KQLQuerysetId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($KQLQuerysetName) {
            $body.displayName = $KQLQuerysetName
        }

        if ($KQLQuerysetDescription) {
            $body.description = $KQLQuerysetDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $script:FabricAuthContext.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLQuerysetId, "Update KQL Queryset in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLQueryset '$KQLQuerysetName' updated successfully!" -Level Host
            return $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update KQLQueryset. Error: $errorDetails" -Level Error
        }
    }
}
