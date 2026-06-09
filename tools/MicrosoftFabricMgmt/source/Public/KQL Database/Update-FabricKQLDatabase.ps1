<#
.SYNOPSIS
Updates the properties of a Fabric KQLDatabase.

.DESCRIPTION
The `Update-FabricKQLDatabase` function updates the name and/or description of a specified Fabric KQLDatabase by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the KQL Database to update. Required to scope the API request.

.PARAMETER KQLDatabaseId
The unique identifier of the KQLDatabase to be updated.

.PARAMETER KQLDatabaseName
The new name for the KQLDatabase.

.PARAMETER KQLDatabaseDescription
(Optional) The new description for the KQLDatabase.

.EXAMPLE
Update-FabricKQLDatabase -KQLDatabaseId "KQLDatabase123" -KQLDatabaseName "NewKQLDatabaseName"

Updates the name of the KQLDatabase with the ID "KQLDatabase123" to "NewKQLDatabaseName".

.EXAMPLE
Update-FabricKQLDatabase -KQLDatabaseId "KQLDatabase123" -KQLDatabaseName "NewName" -KQLDatabaseDescription "Updated description"

Updates both the name and description of the KQLDatabase "KQLDatabase123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricKQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [Alias('DisplayName')]
        [string]$KQLDatabaseName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$KQLDatabaseDescription
    )

    process {
        try {
        # Validate that at least one update parameter is provided
        if (-not $KQLDatabaseName -and -not $KQLDatabaseDescription) {
            Write-FabricLog -Message "At least one of KQLDatabaseName or KQLDatabaseDescription must be specified" -Level Error
            return
        }

        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'kqlDatabases' -ItemId $KQLDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body conditionally
        $body = @{}

        if ($KQLDatabaseName) {
            $body.displayName = $KQLDatabaseName
        }

        if ($KQLDatabaseDescription) {
            $body.description = $KQLDatabaseDescription
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
        if ($PSCmdlet.ShouldProcess($KQLDatabaseId, "Update KQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDatabase '$KQLDatabaseName' updated successfully!" -Level Host
            return $response
        }
    }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update KQLDatabase. Error: $errorDetails" -Level Error
        }
    }
}
