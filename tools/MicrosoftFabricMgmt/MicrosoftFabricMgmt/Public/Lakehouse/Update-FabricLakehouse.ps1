<#
.SYNOPSIS
Updates the properties of a Fabric Lakehouse.

.DESCRIPTION
The `Update-FabricLakehouse` function updates the name and/or description of a specified Fabric Lakehouse by making a PATCH request to the API.

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
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$LakehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseDescription
    )
    try {
       # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $LakehouseName
        }

        if ($LakehouseDescription) {
            $body.description = $LakehouseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Lakehouse '$LakehouseName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Lakehouse. Error: $errorDetails" -Level Error
    }
}
