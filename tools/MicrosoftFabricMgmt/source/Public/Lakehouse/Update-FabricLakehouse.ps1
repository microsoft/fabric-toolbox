<#
.SYNOPSIS
Updates the properties of a Fabric Lakehouse.

.DESCRIPTION
The `Update-FabricLakehouse` function updates the name and/or description of a specified Fabric Lakehouse by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Lakehouse to update. Required to scope the API request.

.PARAMETER LakehouseId
The unique identifier of the Lakehouse to be updated.

.PARAMETER LakehouseName
The new name for the Lakehouse.

.PARAMETER LakehouseDescription
(Optional) The new description for the Lakehouse.

.EXAMPLE
Update-FabricLakehouse -LakehouseId "Lakehouse123" -LakehouseName "NewLakehouseName"

Updates the name of the Lakehouse with the ID "Lakehouse123" to "NewLakehouseName".

.EXAMPLE
Update-FabricLakehouse -LakehouseId "Lakehouse123" -LakehouseName "NewName" -LakehouseDescription "Updated description"

Updates both the name and description of the Lakehouse "Lakehouse123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricLakehouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [Alias('DisplayName')]
        [string]$LakehouseName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$LakehouseDescription
    )
    process {
    try {
        # Validate that at least one update parameter is provided
        if (-not $LakehouseName -and -not $LakehouseDescription) {
            Write-FabricLog -Message "At least one of LakehouseName or LakehouseDescription must be specified" -Level Error
            return
        }

        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'lakehouses' -ItemId $LakehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($LakehouseName) {
            $body.displayName = $LakehouseName
        }

        if ($LakehouseDescription) {
            $body.description = $LakehouseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($LakehouseId, "Update Lakehouse in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Lakehouse '$LakehouseName' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Lakehouse. Error: $errorDetails" -Level Error
    }
    }
}
