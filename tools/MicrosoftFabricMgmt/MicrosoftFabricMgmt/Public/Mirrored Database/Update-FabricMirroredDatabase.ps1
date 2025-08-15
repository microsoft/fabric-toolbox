<#
.SYNOPSIS
Updates the properties of a Fabric MirroredDatabase.

.DESCRIPTION
The `Update-FabricMirroredDatabase` function updates the name and/or description of a specified Fabric MirroredDatabase by making a PATCH request to the API.

.PARAMETER MirroredDatabaseId
The unique identifier of the MirroredDatabase to be updated.

.PARAMETER MirroredDatabaseName
The new name for the MirroredDatabase.

.PARAMETER MirroredDatabaseDescription
(Optional) The new description for the MirroredDatabase.

.EXAMPLE
Update-FabricMirroredDatabase -MirroredDatabaseId "MirroredDatabase123" -MirroredDatabaseName "NewMirroredDatabaseName"

Updates the name of the MirroredDatabase with the ID "MirroredDatabase123" to "NewMirroredDatabaseName".

.EXAMPLE
Update-FabricMirroredDatabase -MirroredDatabaseId "MirroredDatabase123" -MirroredDatabaseName "NewName" -MirroredDatabaseDescription "Updated description"

Updates both the name and description of the MirroredDatabase "MirroredDatabase123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Update-FabricMirroredDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MirroredDatabaseName
        }

        if ($MirroredDatabaseDescription) {
            $body.description = $MirroredDatabaseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Mirrored Database '$MirroredDatabaseName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
